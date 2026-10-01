import { describe, expect, it, vi, beforeEach } from "vitest";

const { captured } = vi.hoisted(() => ({
  captured: { counts: [] as any[], groupBys: [] as any[] },
}));

vi.mock("@repo/server-core/db/scope", () => ({
  scopedDb: async (_u: unknown, fn: (tx: any) => Promise<unknown>) =>
    fn({
      course: { findMany: async () => [] },
      enrollment: { count: async () => 0 },
      session: { findMany: async () => [], groupBy: async () => [] },
      attendanceRecord: {
        count: async ({ where }: any) => {
          captured.counts.push(where);
          return 2;
        },
        groupBy: async (args: any) => {
          captured.groupBys.push(args);
          return [
            { status: "present", _count: 3 },
            { status: "absent", _count: 1 },
          ];
        },
        findMany: async () => [],
      },
      room: { findMany: async () => [] },
      grade: { findMany: async () => [] },
      gradeScore: { findMany: async () => [], groupBy: async () => [] },
    }),
  platformDb: async (fn: (tx: any) => Promise<unknown>) => fn({}),
}));

const { getTeacherDashboard } = await import("@repo/server-core/services/reports/reports");

const TEACHER = { id: "teacher-1", role: "teacher" } as any;

beforeEach(() => {
  captured.counts = [];
  captured.groupBys = [];
});

describe("getTeacherDashboard — counter-only arrivals ride in the payload", () => {
  it("one count over today's non-cancelled sessions of THIS teacher", async () => {
    const r = await getTeacherDashboard(TEACHER);

    expect(r.counterOnlyToday).toBe(2);
    const where = captured.counts.find((w) => w.status === "counter_only");
    expect(where.session.teacherId).toBe("teacher-1");
    expect(where.session.status).toEqual({ not: "cancelled" });
    expect(where.session.date.gte).toBeInstanceOf(Date);
    expect(where.session.date.lt).toBeInstanceOf(Date);
  });

  it("the attendance rate comes from one status groupBy", async () => {
    const r = await getTeacherDashboard(TEACHER);

    const statusPass = captured.groupBys.filter(
      (a) => a.by.length === 1 && a.by[0] === "status",
    );
    expect(statusPass).toHaveLength(1);
    expect(r.avgAttendanceRate).toBe(75);
  });
});
