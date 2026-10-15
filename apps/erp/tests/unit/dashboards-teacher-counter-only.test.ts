import { describe, expect, it, vi, beforeEach } from "vitest";

type Captured = { sql: string; values: unknown[] };

const { captured, canned } = vi.hoisted(() => ({
  captured: { base: [] as Captured[] },
  canned: {
    base: {
      activeCourses: [],
      activeStudents: 0,
      todaySessions: [],
      attendanceTotal: 4,
      attendancePresent: 3,
      counterOnlyToday: 2,
      rooms: [],
    },
  },
}));

vi.mock("@repo/server-core/db/scope", async () => {
  const { Prisma } = await import("@repo/database");
  const queryRaw = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = Prisma.sql(strings, ...values);
    if (q.sql.includes("'counterOnlyToday'")) {
      captured.base.push({ sql: q.text, values: q.values });
      return [{ base: canned.base }];
    }
    return [];
  };
  return {
    scopedDb: async (_u: unknown, fn: (tx: any) => Promise<unknown>) =>
      fn({
        $queryRaw: queryRaw,
        course: { findMany: async () => [] },
        grade: { findMany: async () => [] },
        attendanceRecord: { findMany: async () => [] },
      }),
    platformDb: async (fn: (tx: any) => Promise<unknown>) => fn({ $queryRaw: async () => [] }),
  };
});

const { getTeacherDashboard } = await import("@repo/server-core/services/reports/reports");

const TEACHER = { id: "teacher-1", role: "teacher" } as any;

/** The text of one `'key', (SELECT …)` entry of the json_build_object. */
function section(q: Captured, key: string): string {
  const start = q.sql.indexOf(`'${key}',`);
  expect(start).toBeGreaterThan(-1);
  const rest = q.sql.slice(start + key.length + 3);
  const next = rest.search(/\n\s*'[a-zA-Z]+', \(SELECT/);
  return next === -1 ? rest : rest.slice(0, next);
}

function bound(q: Captured, text: string, m: RegExpMatchArray | null): unknown {
  expect(m, text).not.toBeNull();
  return q.values[Number(m![1]) - 1];
}

beforeEach(() => {
  captured.base = [];
});

describe("getTeacherDashboard — counter-only count", () => {
  it("one count over today's non-cancelled sessions of THIS teacher", async () => {
    const r = await getTeacherDashboard(TEACHER);

    expect(r.counterOnlyToday).toBe(2);
    expect(captured.base).toHaveLength(1);
    const [base] = captured.base;
    const sql = section(base, "counterOnlyToday");

    expect(sql).toMatch(/a\.status = 'counter_only'/);
    expect(sql).toMatch(/a\.session_id IN \(SELECT s\.id FROM sessions s/);
    expect(sql).toMatch(/s\.status <> 'cancelled'/);
    expect(bound(base, "teacher", sql.match(/s\.teacher_id = \$(\d+)::uuid/))).toBe("teacher-1");

    const from = bound(base, "from", sql.match(/s\.date >= \$(\d+)/));
    const to = bound(base, "to", sql.match(/s\.date < \$(\d+)/));
    expect(from).toBeInstanceOf(Date);
    expect(to).toBeInstanceOf(Date);
    expect((to as Date).getTime() - (from as Date).getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("the attendance rate is present over every status, from the same base query", async () => {
    const r = await getTeacherDashboard(TEACHER);

    expect(captured.base).toHaveLength(1);
    const [base] = captured.base;
    expect(section(base, "attendanceTotal")).not.toMatch(/a\.status/);
    expect(section(base, "attendancePresent")).toMatch(/a\.status = 'present'/);
    expect(r.avgAttendanceRate).toBe(75);
  });
});
