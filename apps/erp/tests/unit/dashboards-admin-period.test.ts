import { describe, expect, it, vi, beforeEach } from "vitest";

const { captured } = vi.hoisted(() => ({
  captured: { payment: [] as any[], expense: [] as any[], attendance: [] as any[] },
}));

vi.mock("@repo/server-core/db/scope", () => ({
  scopedDb: async (_u: unknown, fn: (tx: any) => Promise<unknown>) =>
    fn({
      enrollment: { count: async () => 0, findMany: async () => [] },
      course: { groupBy: async () => [], count: async () => 0, findMany: async () => [] },
      session: { findMany: async () => [], groupBy: async () => [] },
      payment: {
        aggregate: async ({ where }: any) => {
          captured.payment.push(where);
          return { _sum: { amount: 1000 } };
        },
        groupBy: async () => [],
        findMany: async () => [],
      },
      expense: {
        aggregate: async ({ where }: any) => {
          captured.expense.push(where);
          return { _sum: { amount: 400 } };
        },
        findMany: async () => [],
        groupBy: async () => [],
      },
      enrollmentRequest: { count: async () => 0, groupBy: async () => [] },
      attendanceRecord: {
        count: async ({ where }: any) => {
          captured.attendance.push(where);
          return 10;
        },
        groupBy: async () => [],
      },
      teacherProfile: { findMany: async () => [] },
      user: { findMany: async () => [] },
      subscription: { findMany: async () => [], count: async () => 0 },
    }),
  platformDb: async (fn: (tx: any) => Promise<unknown>) =>
    fn({
      $queryRaw: async () => [],
      payment: { groupBy: async () => [], findMany: async () => [] },
      enrollment: { findMany: async () => [] },
      subscription: { findMany: async () => [] },
      user: { findMany: async () => [] },
    }),
}));

const { getAdminDashboard } = await import("@repo/server-core/services/reports/reports");

const OWNER = { id: "owner-1", role: "center_admin", centerId: "center-1" } as any;

beforeEach(() => {
  captured.payment = [];
  captured.expense = [];
  captured.attendance = [];
});

describe("getAdminDashboard — a period narrows the money", () => {
  it("`from`/`to` bound the revenue aggregate to Cairo days", async () => {
    await getAdminDashboard(OWNER, undefined, { from: "2026-08-01", to: "2026-08-31" });

    expect(captured.payment[0].paidAt).toEqual({
      gte: new Date("2026-07-31T21:00:00.000Z"),
      lte: new Date("2026-08-31T20:59:59.999Z"),
    });
  });

  it("expenses take the same window, so netProfit compares like with like", async () => {
    await getAdminDashboard(OWNER, undefined, { from: "2026-08-01", to: "2026-08-31" });

    expect(captured.expense[0].expenseDate).toEqual(captured.payment[0].paidAt);
  });

  it("attendance is dated through its session — the only date it has", async () => {
    await getAdminDashboard(OWNER, undefined, { from: "2026-08-01", to: "2026-08-31" });

    expect(captured.attendance[0].session).toEqual({ date: captured.payment[0].paidAt });
  });

  it("the external breakdown uses the SAME window as the headline it splits", async () => {
    await getAdminDashboard(OWNER, undefined, { from: "2026-08-01", to: "2026-08-31" });

    for (const where of captured.payment) {
      expect(where.paidAt).toEqual(captured.payment[0].paidAt);
    }
  });

  it("it bounds the range through the SAME helper the payments log uses", async () => {
    const { dayRange } = await import("@repo/server-core/lib/day-range");
    await getAdminDashboard(OWNER, undefined, { from: "2026-08-01", to: "2026-08-31" });

    expect(captured.payment[0].paidAt).toEqual(dayRange("2026-08-01", "2026-08-31"));
  });
});

describe("getAdminDashboard — the payload names its own timeframe", () => {
  it("a period is reported back, so a consumer can label the figure truthfully", async () => {
    const r = await getAdminDashboard(OWNER, undefined, { from: "2026-08-01", to: "2026-08-31" });

    expect(r.period).toEqual({ from: "2026-08-01", to: "2026-08-31" });
  });

  it("NO period is reported as lifetime EXPLICITLY, not as a missing key", async () => {
    const r = await getAdminDashboard(OWNER);

    expect(r.period).toEqual({ from: null, to: null });
  });

  it("an open-ended period is reported as given", async () => {
    const r = await getAdminDashboard(OWNER, undefined, { from: "2026-08-01" });

    expect(r.period).toEqual({ from: "2026-08-01", to: null });
  });
});

describe("getAdminDashboard — omitting the period changes nothing", () => {
  it("no date clause reaches any aggregate", async () => {
    await getAdminDashboard(OWNER);

    expect(captured.payment.every((w) => !("paidAt" in w))).toBe(true);
    expect(captured.expense.every((w) => !("expenseDate" in w))).toBe(true);
    expect(captured.attendance.every((w) => !("session" in w))).toBe(true);
  });

  it("the existing two-argument call still works — apps/superadmin passes exactly this", async () => {
    const r = await getAdminDashboard(OWNER, { systemStatus: "external" } as any);

    expect(r.period).toEqual({ from: null, to: null });
    expect(r.totals).toHaveProperty("revenue");
  });

  it("current-STATE counters stay outside the period entirely", async () => {
    const lifetime = await getAdminDashboard(OWNER);
    const august = await getAdminDashboard(OWNER, undefined, {
      from: "2026-08-01",
      to: "2026-08-31",
    });

    expect(august.totals.students).toBe(lifetime.totals.students);
    expect(august.totals.teachers).toBe(lifetime.totals.teachers);
    expect(august.totals.activeCourses).toBe(lifetime.totals.activeCourses);
    expect(august.pendingEnrollmentRequests).toBe(lifetime.pendingEnrollmentRequests);
  });
});
