import { describe, expect, it, vi, beforeEach } from "vitest";

type Captured = { sql: string; values: unknown[] };

const { captured, canned } = vi.hoisted(() => ({
  captured: { base: [] as Captured[], all: [] as Captured[] },
  canned: {
    base: {
      totalStudents: 12,
      totalTeachers: 4,
      totalCourses: 5,
      todaySessionCount: 3,
      revenue: 1000,
      expenses: 400,
      pendingEnrollmentRequests: 2,
      attendanceTotal: 10,
      attendancePresent: 6,
      externalTeachers: 1,
      externalCourses: 1,
      externalStudents: 2,
      externalRevenue: 300,
    },
  },
}));

vi.mock("@repo/server-core/db/scope", async () => {
  const { Prisma } = await import("@repo/database");
  const queryRaw = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = Prisma.sql(strings, ...values);
    const entry = { sql: q.text, values: q.values };
    captured.all.push(entry);
    if (q.sql.includes("'totalStudents'")) {
      captured.base.push(entry);
      return [{ base: canned.base }];
    }
    if (q.sql.includes("AS n FROM")) return [{ n: 0 }];
    if (q.sql.includes("AS payments,")) return [{ payments: [], expenses: [] }];
    return [];
  };
  return {
    scopedDb: async (_u: unknown, fn: (tx: any) => Promise<unknown>) =>
      fn({
        $queryRaw: queryRaw,
        session: { groupBy: async () => [] },
        enrollmentRequest: { groupBy: async () => [] },
      }),
    platformDb: async (fn: (tx: any) => Promise<unknown>) => fn({ $queryRaw: async () => [] }),
  };
});

const { getAdminDashboard } = await import("@repo/server-core/services/reports/reports");

const OWNER = { id: "owner-1", role: "center_admin", centerId: "center-1" } as any;
const AUGUST = { from: "2026-08-01", to: "2026-08-31" };

/** Every `<col> <op> $n` in `sql`, resolved to its bound value. */
function bounds(q: Captured, col: string, op: ">=" | "<=" | "<"): unknown[] {
  const re = new RegExp(`${col.replace(".", "\\.")} ${op} \\$(\\d+)`, "g");
  return [...q.sql.matchAll(re)].map((m) => q.values[Number(m[1]) - 1]);
}

/** The text of one `'key', (SELECT …)` entry of the json_build_object. */
function section(q: Captured, key: string): string {
  const start = q.sql.indexOf(`'${key}',`);
  expect(start).toBeGreaterThan(-1);
  const rest = q.sql.slice(start + key.length + 3);
  const next = rest.search(/\n\s*'[a-zA-Z]+', \(SELECT/);
  return next === -1 ? rest : rest.slice(0, next);
}

const CAIRO_AUGUST = {
  gte: new Date("2026-07-31T21:00:00.000Z"),
  lte: new Date("2026-08-31T20:59:59.999Z"),
};

beforeEach(() => {
  captured.base = [];
  captured.all = [];
});

describe("getAdminDashboard — a period narrows the money", () => {
  it("`from`/`to` bound the revenue aggregate to Cairo days", async () => {
    await getAdminDashboard(OWNER, undefined, AUGUST);

    const [base] = captured.base;
    const revenue = section(base, "revenue");
    expect(revenue).toMatch(/p\.paid_at >= \$\d+ AND p\.paid_at <= \$\d+/);
    expect(bounds(base, "p.paid_at", ">=")[0]).toEqual(CAIRO_AUGUST.gte);
    expect(bounds(base, "p.paid_at", "<=")[0]).toEqual(CAIRO_AUGUST.lte);
  });

  it("expenses take the same window, so netProfit compares like with like", async () => {
    await getAdminDashboard(OWNER, undefined, AUGUST);

    const [base] = captured.base;
    expect(section(base, "expenses")).toMatch(/x\.expense_date >= \$\d+ AND x\.expense_date <= \$\d+/);
    expect(bounds(base, "x.expense_date", ">=")).toEqual(bounds(base, "p.paid_at", ">=").slice(0, 1));
    expect(bounds(base, "x.expense_date", "<=")).toEqual(bounds(base, "p.paid_at", "<=").slice(0, 1));
  });

  it("attendance is dated through its session — the only date it has", async () => {
    await getAdminDashboard(OWNER, undefined, AUGUST);

    const [base] = captured.base;
    const viaSession = /a\.session_id IN \(SELECT s\.id FROM sessions s WHERE TRUE AND s\.date >= \$\d+ AND s\.date <= \$\d+\)/;
    expect(section(base, "attendanceTotal")).toMatch(viaSession);
    expect(section(base, "attendancePresent")).toMatch(viaSession);
    expect(bounds(base, "s.date", "<=")).toEqual([CAIRO_AUGUST.lte, CAIRO_AUGUST.lte]);
    const sessionStarts = bounds(base, "s.date", ">=").filter((d) => (d as Date).getTime() === CAIRO_AUGUST.gte.getTime());
    expect(sessionStarts).toHaveLength(2);
  });

  it("the external breakdown uses the SAME window as the headline it splits", async () => {
    await getAdminDashboard(OWNER, undefined, AUGUST);

    const [base] = captured.base;
    expect(section(base, "externalRevenue")).toMatch(/p\.paid_at >= \$\d+ AND p\.paid_at <= \$\d+/);
    const starts = bounds(base, "p.paid_at", ">=");
    const ends = bounds(base, "p.paid_at", "<=");
    expect(starts).toHaveLength(2);
    expect(ends).toHaveLength(2);
    expect(starts[1]).toEqual(starts[0]);
    expect(ends[1]).toEqual(ends[0]);
  });

  it("it bounds the range through the SAME helper the payments log uses", async () => {
    const { dayRange } = await import("@repo/server-core/lib/day-range");
    await getAdminDashboard(OWNER, undefined, AUGUST);

    const [base] = captured.base;
    const expected = dayRange("2026-08-01", "2026-08-31")!;
    expect(bounds(base, "p.paid_at", ">=")[0]).toEqual(expected.gte);
    expect(bounds(base, "p.paid_at", "<=")[0]).toEqual(expected.lte);
  });
});

describe("getAdminDashboard — the payload names its own timeframe", () => {
  it("a period is reported back, so a consumer can label the figure truthfully", async () => {
    const r = await getAdminDashboard(OWNER, undefined, AUGUST);

    expect(r.period).toEqual({ from: "2026-08-01", to: "2026-08-31" });
  });

  it("NO period is reported as lifetime EXPLICITLY, not as a missing key", async () => {
    const r = await getAdminDashboard(OWNER);

    expect(r.period).toEqual({ from: null, to: null });
  });

  it("an open-ended period is reported as given", async () => {
    const r = await getAdminDashboard(OWNER, undefined, { from: "2026-08-01" });

    expect(r.period).toEqual({ from: "2026-08-01", to: null });
    const [base] = captured.base;
    expect(bounds(base, "p.paid_at", ">=")).toHaveLength(2);
    expect(bounds(base, "p.paid_at", "<=")).toHaveLength(0);
  });
});

describe("getAdminDashboard — omitting the period changes nothing", () => {
  it("no date clause reaches any aggregate", async () => {
    await getAdminDashboard(OWNER);

    const [base] = captured.base;
    expect(base.sql).not.toMatch(/paid_at/);
    expect(base.sql).not.toMatch(/expense_date/);
    expect(base.sql).not.toMatch(/session_id IN \(SELECT/);
    expect(base.sql).not.toMatch(/s\.date <=/);
    expect(base.values.filter((v) => v instanceof Date)).toHaveLength(2); // today's window, nothing else
  });

  it("the existing two-argument call still works — apps/superadmin passes exactly this", async () => {
    const r = await getAdminDashboard(OWNER, { systemStatus: "external" } as any);

    expect(r.period).toEqual({ from: null, to: null });
    expect(r.totals).toHaveProperty("revenue");
    expect(captured.base[0].values).toContain("external");
  });

  it("current-STATE counters stay outside the period entirely", async () => {
    const lifetime = await getAdminDashboard(OWNER);
    const august = await getAdminDashboard(OWNER, undefined, AUGUST);

    expect(august.totals.students).toBe(lifetime.totals.students);
    expect(august.totals.teachers).toBe(lifetime.totals.teachers);
    expect(august.totals.activeCourses).toBe(lifetime.totals.activeCourses);
    expect(august.pendingEnrollmentRequests).toBe(lifetime.pendingEnrollmentRequests);

    const [, withPeriod] = captured.base;
    for (const key of ["totalStudents", "totalTeachers", "totalCourses", "pendingEnrollmentRequests"]) {
      expect(section(withPeriod, key)).not.toMatch(/>=|<=/);
    }
  });
});

describe("getAdminDashboard — one attendance pass, a count for today", () => {
  it("the headline rate is present over every status, from ONE base query", async () => {
    const r = await getAdminDashboard(OWNER);

    expect(captured.base).toHaveLength(1);
    expect(section(captured.base[0], "attendanceTotal")).not.toMatch(/a\.status/);
    expect(section(captured.base[0], "attendancePresent")).toMatch(/a\.status = 'present'/);
    expect(r.attendanceRate).toBe(60);
  });

  it("today's sessions are reported as a count, not as rows", async () => {
    const r = await getAdminDashboard(OWNER);

    expect(section(captured.base[0], "todaySessionCount")).toMatch(/count\(\*\) FROM sessions s/);
    expect(r.todaySessionCount).toBe(3);
    expect(r).not.toHaveProperty("todaySessions");
  });
});
