import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const tx = {
    session: { findMany: vi.fn() },
    enrollment: { findMany: vi.fn() },
    subscription: { findMany: vi.fn() },
    notification: { findMany: vi.fn() },
    course: { findMany: vi.fn() },
    center: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  return {
    tx,
    platformDb: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    notify: vi.fn(async (_input: { recipients: string[]; body: string; data: Record<string, unknown> }) => undefined),
    studentAndParents: vi.fn(async (id: string) => [id]),
    getNetProfitReport: vi.fn(),
    buildGapReport: vi.fn(),
    send: vi.fn(),
  };
});

vi.mock("@repo/server-core/db/scope", () => ({ platformDb: h.platformDb }));
vi.mock("@repo/server-core/services/notifications/notify", () => ({ notify: h.notify }));
vi.mock("@repo/server-core/services/notifications/fanout", () => ({
  studentAndParents: h.studentAndParents,
}));
vi.mock("@repo/server-core/services/finance/invoices", () => ({ generateAndEmailInvoice: vi.fn() }));
vi.mock("@repo/notifications", () => ({ send: h.send }));
vi.mock("@repo/server-core/services/reports/reports", () => ({
  getNetProfitReport: h.getNetProfitReport,
}));
vi.mock("@repo/server-core/services/external-teachers/gaps", () => ({
  buildGapReport: h.buildGapReport,
}));

import {
  runLessonReminders,
  runSubscriptionRenewalReminders,
  runWeeklyCenterDigest,
} from "@repo/server-core/services/cron/jobs";

afterEach(() => vi.clearAllMocks());

describe("runLessonReminders batches enrollments", () => {
  it("one enrollment query for all sessions, recipients grouped by course", async () => {
    h.tx.session.findMany.mockResolvedValue([
      { id: "s1", courseId: "c1", startTime: "10:00" },
      { id: "s2", courseId: "c2", startTime: "10:05" },
      { id: "s3", courseId: "c1", startTime: "10:10" },
      { id: "s4", courseId: "c3", startTime: "10:10" },
    ]);
    h.tx.enrollment.findMany.mockResolvedValue([
      { courseId: "c1", studentId: "a" },
      { courseId: "c2", studentId: "b" },
      { courseId: "c1", studentId: "c" },
    ]);
    h.tx.notification.findMany.mockResolvedValue([]);

    const out = await runLessonReminders(new Date("2026-09-27T09:30:00Z"));

    expect(h.tx.enrollment.findMany).toHaveBeenCalledTimes(1);
    expect(h.tx.enrollment.findMany.mock.calls[0][0].where).toEqual({
      courseId: { in: ["c1", "c2", "c3"] },
      status: "active",
    });
    expect(h.notify.mock.calls.map((c) => [c[0].data.sessionId, c[0].recipients])).toEqual([
      ["s1", ["a", "c"]],
      ["s2", ["b"]],
      ["s3", ["a", "c"]],
    ]);
    expect(out).toEqual({ sessions: 4, skipped: 0, recipientsNotified: 5 });
  });

  it("no sessions → no enrollment query", async () => {
    h.tx.session.findMany.mockResolvedValue([]);
    await runLessonReminders(new Date("2026-09-27T09:30:00Z"));
    expect(h.tx.enrollment.findMany).not.toHaveBeenCalled();
  });
});

describe("runSubscriptionRenewalReminders batches the dedupe check", () => {
  it("skips exactly the already-reminded subs, one dedupe + one course query per bucket", async () => {
    h.tx.subscription.findMany.mockImplementation(async () => [
      { id: "sub1", studentId: "st1", courseId: "c1", periodEnd: null },
      { id: "sub2", studentId: "st2", courseId: "c1", periodEnd: null },
      { id: "sub3", studentId: "st3", courseId: "c9", periodEnd: null },
    ]);
    h.tx.notification.findMany.mockImplementation(async (args: {
      where: { data: { equals: number } };
    }) =>
      args.where.data.equals === 5
        ? [{ data: { subscriptionId: "sub2", daysLeft: 5 } }, { data: { subscriptionId: "sub2", daysLeft: 5 } }]
        : [],
    );
    h.tx.course.findMany.mockResolvedValue([{ id: "c1", title: "Math" }]);

    const out = await runSubscriptionRenewalReminders(new Date("2026-09-27T09:00:00Z"));

    expect(h.tx.notification.findMany).toHaveBeenCalledTimes(3);
    expect(h.tx.course.findMany).toHaveBeenCalledTimes(3);
    const where = h.tx.notification.findMany.mock.calls[0][0].where;
    expect(where.type).toBe("subscription_expiring");
    expect(where.data).toEqual({ path: ["daysLeft"], equals: 5 });
    expect(where.OR).toHaveLength(3);
    expect(out).toEqual({ job: "subscription-renewal-reminders", notified: 8, skipped: 1 });
    const first = h.notify.mock.calls[0][0];
    expect(first.data.subscriptionId).toBe("sub1");
    expect(first.body).toContain("Math");
    const noCourse = h.notify.mock.calls.find((c) => c[0].data.subscriptionId === "sub3")?.[0];
    expect(noCourse?.body).toBe("A monthly subscription is about to end. Renew to keep attending.");
  });
});

describe("runWeeklyCenterDigest runs centers in bounded parallel", () => {
  it("counts sent/skipped/failed per center; one failure does not abort the rest", async () => {
    const centers = Array.from({ length: 9 }, (_, i) => ({
      id: `ctr${i}`,
      name: `C${i}`,
      ownerUserId: i === 1 ? null : `own${i}`,
    }));
    h.tx.center.findMany.mockResolvedValue(centers);
    h.tx.auditLog.findMany.mockResolvedValue([]);
    h.tx.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      email: `${where.id}@x.eg`,
      locale: "ar",
      status: "active",
    }));
    (h.tx as unknown as { session: { count: () => Promise<number> } }).session.count = vi.fn(
      async () => 3,
    );
    let inFlight = 0;
    let peak = 0;
    h.getNetProfitReport.mockImplementation(async (acting: { centerId: string }) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      if (acting.centerId === "ctr2") throw new Error("boom");
      return { revenue: 1, expenses: 0, netProfit: 1, attendanceRate: 90 };
    });
    h.buildGapReport.mockResolvedValue({ blocking: 0 });
    h.send.mockResolvedValue({ results: [{ status: "sent" }] });

    const out = await runWeeklyCenterDigest(new Date("2026-09-27T09:00:00Z"));

    expect(out).toMatchObject({ sent: 7, skipped: 1, failed: 1 });
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
    expect(h.tx.auditLog.create).toHaveBeenCalledTimes(7);
  });
});
