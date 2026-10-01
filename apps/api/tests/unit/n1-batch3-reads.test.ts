import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const tx = {
    session: { findMany: vi.fn(), createManyAndReturn: vi.fn() },
    course: { findMany: vi.fn() },
    centerTeacherAffiliation: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    teacherProfile: { findMany: vi.fn() },
    review: { groupBy: vi.fn(), aggregate: vi.fn() },
    enrollment: { findMany: vi.fn() },
    grade: { findMany: vi.fn() },
    notification: { update: vi.fn() },
  };
  const run = vi.fn(async (_u: unknown, fn: (t: typeof tx) => unknown) => fn(tx));
  return { tx, run };
});

vi.mock("@repo/server-core/db/scope", () => ({
  scopedDb: h.run,
  platformDb: vi.fn(async (fn: (t: typeof h.tx) => unknown) => fn(h.tx)),
}));
vi.mock("@repo/server-core/erp-auth/session", () => ({
  requireSession: vi.fn(async () => ({ id: "u1", role: "student" })),
}));

import { generateSessionsTx } from "@repo/server-core/services/sessions/session-generator";
import { listRosterTeachers } from "@repo/server-core/services/center/roster";
import { listGrades } from "@repo/server-core/services/grades/grades";
import { POST as markRead } from "../../src/routes/v1/notifications/[id]/read/route";
import type { TenantTx } from "@repo/database";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateSessionsTx — one conflict query for the whole range", () => {
  const course = {
    id: "c1",
    teacherId: "t1",
    defaultRoomId: "r1",
    schedulePattern: {
      daysOfWeek: [1, 3],
      startTime: "16:00",
      endTime: "18:00",
      startDate: d("2099-01-05"),
      endDate: d("2099-01-31"),
    },
  };

  it("buckets clashes per occurrence day and ignores clashes on days the course does not meet", async () => {
    h.tx.session.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "s1", courseId: "k1", startTime: "17:00", endTime: "19:00", date: d("2099-01-07") },
        { id: "s2", courseId: "k1", startTime: "17:00", endTime: "19:00", date: d("2099-01-08") },
      ]);
    h.tx.course.findMany.mockResolvedValue([{ id: "k1", title: "Physics" }]);

    const err = await generateSessionsTx(h.tx as unknown as TenantTx, course).catch((e) => e);
    expect(err?.details?.conflicts).toEqual([
      { sessionId: "s1", courseTitle: "Physics", date: "2099-01-07", startTime: "17:00", endTime: "19:00" },
    ]);
    expect(h.tx.session.findMany).toHaveBeenCalledTimes(2);
    expect(h.tx.course.findMany).toHaveBeenCalledTimes(1);
    expect(h.tx.session.createManyAndReturn).not.toHaveBeenCalled();
  });

  it("inserts every non-existing occurrence when nothing clashes", async () => {
    h.tx.session.findMany
      .mockResolvedValueOnce([{ originalDate: d("2099-01-05") }])
      .mockResolvedValueOnce([]);
    h.tx.session.createManyAndReturn.mockImplementation(async ({ data }) =>
      data.map((_: unknown, i: number) => ({ id: `n${i}` })),
    );

    const ids = await generateSessionsTx(h.tx as unknown as TenantTx, course);
    expect(ids).toHaveLength(7);
    expect(h.tx.session.findMany).toHaveBeenCalledTimes(2);
    expect(h.tx.course.findMany).not.toHaveBeenCalled();
  });
});

describe("listRosterTeachers — no per-teacher queries", () => {
  it("uses one course query and one review groupBy for every teacher", async () => {
    h.tx.centerTeacherAffiliation.findMany.mockResolvedValue([
      { teacherId: "t1", centerId: "c" },
      { teacherId: "t2", centerId: "c" },
    ]);
    h.tx.user.findMany.mockResolvedValue([
      { id: "t1", name: "A", email: null, status: "active" },
      { id: "t2", name: "B", email: null, status: "active" },
    ]);
    h.tx.teacherProfile.findMany.mockResolvedValue([]);
    h.tx.course.findMany.mockResolvedValue([
      { teacherId: "t1", subject: "Math" },
      { teacherId: "t1", subject: "Math" },
      { teacherId: "t1", subject: "Physics" },
    ]);
    h.tx.review.groupBy.mockResolvedValue([
      { teacherId: "t1", _avg: { rating: 4.26 }, _count: { _all: 3 } },
    ]);

    const items = await listRosterTeachers({ id: "a", role: "center_admin", centerId: "c" } as never);
    expect(h.tx.course.findMany).toHaveBeenCalledTimes(1);
    expect(h.tx.review.groupBy).toHaveBeenCalledTimes(1);
    expect(h.tx.review.aggregate).not.toHaveBeenCalled();
    expect(items.map((i) => [i.teacherId, i.coursesCount, i.subjects, i.rating, i.reviewsCount])).toEqual([
      ["t1", 3, ["Math", "Physics"], 4.3, 3],
      ["t2", 0, [], 0, 0],
    ]);
  });
});

describe("listGrades — a student loads only its own scores", () => {
  it("filters scores in the query, not in JS", async () => {
    h.tx.enrollment.findMany.mockResolvedValue([{ courseId: "k1" }]);
    h.tx.grade.findMany.mockResolvedValue([
      { id: "g1", courseId: "k1", scores: [{ studentId: "s1", score: 9 }] },
    ]);
    h.tx.course.findMany.mockResolvedValue([{ id: "k1", title: "Math", subject: "math" }]);

    const out = await listGrades({}, { id: "s1", role: "student" });
    expect(h.tx.grade.findMany.mock.calls[0][0].include).toEqual({
      scores: { where: { studentId: "s1" } },
    });
    expect(out[0].scores).toEqual([{ studentId: "s1", score: 9 }]);
  });
});

describe("POST /notifications/[id]/read — one scoped write", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("marks the caller's notification read in one update", async () => {
    h.tx.notification.update.mockResolvedValue({ id: "n1", read: true });
    const res = await markRead(new Request("http://x/"), ctx("n1") as never);
    expect(res.status).toBe(200);
    expect(h.tx.notification.update).toHaveBeenCalledWith({
      where: { id: "n1", userId: "u1" },
      data: { read: true },
    });
  });

  it("still 404s a foreign or missing id", async () => {
    h.tx.notification.update.mockRejectedValue(Object.assign(new Error("nf"), { code: "P2025" }));
    const res = await markRead(new Request("http://x/"), ctx("n2") as never);
    expect(res.status).toBe(404);
  });
});
