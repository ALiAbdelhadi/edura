import { describe, expect, it, vi, beforeEach } from "vitest";

type Captured = { sql: string; values: unknown[] };

const { captured, requireSession, toActingUser } = vi.hoisted(() => ({
  captured: { queries: [] as Captured[] },
  requireSession: vi.fn(),
  toActingUser: vi.fn(),
}));

vi.mock("@repo/server-core/erp-auth/session", () => ({ requireSession }));
vi.mock("@repo/server-core/authz/teacher-actor", () => ({ toActingUser }));
vi.mock("@repo/server-core/authz/center-actor", () => ({ authorizeCenterActor: vi.fn() }));
vi.mock("@repo/server-core/services/wallet/parent-wallet-facade", () => ({
  approvedChildIds: async () => ["child-1"],
  assertApprovedChild: async () => undefined,
}));
vi.mock("@repo/server-core/db/scope", async () => {
  const { Prisma } = await import("@repo/database");
  const $queryRaw = async (first: any, ...values: unknown[]) => {
    const q = Array.isArray(first) ? Prisma.sql(first as any, ...values) : first;
    captured.queries.push({ sql: q.text, values: q.values });
    return [];
  };
  return {
    scopedDb: async (_u: unknown, fn: (tx: any) => Promise<unknown>) => fn({ $queryRaw }),
  };
});

const { GET } = await import("../../src/routes/v1/sessions/route");

const call = (qs = "") => GET(new Request(`http://localhost/api/v1/sessions${qs}`), {} as any);

/** Every bound value that follows `pattern` (a regex source ending just before `$n`). */
function boundAfter(q: Captured, pattern: string): unknown[] {
  return [...q.sql.matchAll(new RegExp(`${pattern}\\$(\\d+)`, "g"))].map(
    (m) => q.values[Number(m[1]) - 1],
  );
}

beforeEach(() => {
  captured.queries = [];
  const student = { id: "student-1", role: "student" };
  requireSession.mockResolvedValue(student);
  toActingUser.mockResolvedValue(student);
});

describe("GET /sessions — a caller can ask for a window", () => {
  it("no limit sent → no LIMIT, exactly as before", async () => {
    await call("?studentId=me");
    expect(captured.queries[0].sql).not.toMatch(/\bLIMIT \$\d/);
  });

  it("limit bounds the rows, capped at 500", async () => {
    await call("?studentId=me&from=2026-09-27&limit=50");
    expect(boundAfter(captured.queries[0], "\\bLIMIT ")).toEqual([50]);
    expect(boundAfter(captured.queries[0], "s\\.date >= ")).toEqual([new Date("2026-09-27")]);
    expect(boundAfter(captured.queries[0], "s\\.date <= ")).toEqual([]);

    await call("?limit=100000");
    expect(boundAfter(captured.queries[1], "\\bLIMIT ")).toEqual([500]);
  });

  it("a malformed limit is ignored rather than refused", async () => {
    await call("?limit=abc");
    await call("?limit=0");
    await call("?limit=2.5");
    expect(captured.queries).toHaveLength(3);
    for (const q of captured.queries) expect(q.sql).not.toMatch(/\bLIMIT \$\d/);
  });

  it("studentId=me reads the student's enrollments once, not twice", async () => {
    await call("?studentId=me");
    expect(captured.queries).toHaveLength(1);
    const q = captured.queries[0];
    expect(q.sql.match(/FROM enrollments/g)).toHaveLength(1);
    expect(q.sql).toMatch(/s\.course_id IN \(SELECT course_id FROM enrollments\s+WHERE student_id = \$\d+::uuid AND status = 'active'\)/);
    expect(boundAfter(q, "student_id = ")).toEqual(["student-1"]);
  });
});
