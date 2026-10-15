import { describe, expect, it, vi, beforeEach } from "vitest";

type Captured = { sql: string; values: unknown[] };

const {
  requireSession,
  toActingUser,
  assertApprovedChild,
  approvedChildIds,
  state,
} = vi.hoisted(() => ({
  requireSession: vi.fn(),
  toActingUser: vi.fn(),
  assertApprovedChild: vi.fn(async () => undefined),
  approvedChildIds: vi.fn(async () => ["child-a", "child-b"]),
  state: { queries: [] as Captured[] },
}));

vi.mock("@repo/server-core/erp-auth/session", () => ({ requireSession, getSessionUser: vi.fn() }));
vi.mock("@repo/server-core/authz/teacher-actor", () => ({ toActingUser }));
vi.mock("@repo/server-core/authz/center-actor", () => ({ authorizeCenterActor: vi.fn() }));
vi.mock("@repo/server-core/services/wallet/parent-wallet-facade", () => ({
  assertApprovedChild,
  approvedChildIds,
}));
vi.mock("@repo/server-core/db/scope", async () => {
  const { Prisma } = await import("@repo/database");
  const $queryRaw = async (first: any, ...values: unknown[]) => {
    const q = Array.isArray(first) ? Prisma.sql(first as any, ...values) : first;
    state.queries.push({ sql: q.text, values: q.values });
    return [];
  };
  return {
    scopedDb: async (_user: unknown, fn: (tx: any) => Promise<unknown>) => fn({ $queryRaw }),
  };
});

const { GET } = await import("../../src/routes/v1/sessions/route");

const PARENT = { id: "parent-1", role: "parent" } as any;

function req(qs = "") {
  return new Request(`http://localhost/api/v1/sessions${qs}`);
}

/** The enrollment subquery that scopes the session read: its student ids + its text. */
function enrollmentScope(): { studentIds: unknown; sql: string } {
  expect(state.queries).toHaveLength(1);
  const q = state.queries[0];
  const m = q.sql.match(
    /s\.course_id IN \(SELECT course_id FROM enrollments\s+WHERE student_id = ANY\(\$(\d+)::uuid\[\]\)[^)]*\)/,
  );
  expect(m).not.toBeNull();
  return { studentIds: q.values[Number(m![1]) - 1], sql: m![0] };
}

beforeEach(() => {
  requireSession.mockResolvedValue(PARENT);
  toActingUser.mockResolvedValue(PARENT);
  assertApprovedChild.mockClear();
  assertApprovedChild.mockResolvedValue(undefined);
  approvedChildIds.mockClear();
  approvedChildIds.mockResolvedValue(["child-a", "child-b"]);
  state.queries = [];
});

describe("GET /api/v1/sessions — a parent may narrow to one child", () => {
  it("`studentId=<child>` scopes the read to that child's enrollments alone", async () => {
    const res = await GET(req("?studentId=child-a"), {} as any);

    expect(res.status).toBe(200);
    expect(enrollmentScope().studentIds).toEqual(["child-a"]);
  });

  it("it goes through assertApprovedChild — the shared gate, not a local lookup", async () => {
    await GET(req("?studentId=child-a"), {} as any);

    expect(assertApprovedChild).toHaveBeenCalledTimes(1);
    expect(assertApprovedChild.mock.calls[0].slice(1)).toEqual(["parent-1", "child-a"]);
    expect(state.queries[0].sql).not.toMatch(/parent_student_links/);
  });

  it("a child the parent has no APPROVED link to is refused, not silently widened", async () => {
    const forbidden = new Error("Not an approved child of this parent");
    (forbidden as any).status = 403;
    assertApprovedChild.mockRejectedValue(forbidden);

    const res = await GET(req("?studentId=someone-elses-child"), {} as any);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(state.queries).toHaveLength(0);
  });

  it("NO WIDENING: a refused child does not fall back to the all-children union", async () => {
    assertApprovedChild.mockRejectedValue(Object.assign(new Error("nope"), { status: 403 }));

    await GET(req("?studentId=someone-elses-child"), {} as any);

    expect(approvedChildIds).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/sessions — the parent default is unchanged", () => {
  it("no `studentId` still returns the union of every approved child's courses", async () => {
    const res = await GET(req(), {} as any);

    expect(res.status).toBe(200);
    expect(enrollmentScope().studentIds).toEqual(["child-a", "child-b"]);
    expect(assertApprovedChild).not.toHaveBeenCalled();
  });

  it("`studentId=me` is meaningless for a parent and falls back to the union", async () => {
    await GET(req("?studentId=me"), {} as any);

    expect(enrollmentScope().studentIds).toEqual(["child-a", "child-b"]);
    expect(assertApprovedChild).not.toHaveBeenCalled();
  });

  it("a parent with no linked children is still refused", async () => {
    approvedChildIds.mockResolvedValue([]);

    const res = await GET(req(), {} as any);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(state.queries).toHaveLength(0);
  });

  it("only active enrollments count, for both the narrowed and the union case", async () => {
    await GET(req("?studentId=child-a"), {} as any);
    expect(enrollmentScope().sql).toMatch(/AND status = 'active'\)$/);

    state.queries = [];
    await GET(req(), {} as any);
    expect(enrollmentScope().sql).toMatch(/AND status = 'active'\)$/);
  });
});
