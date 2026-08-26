// PARENT_IA_AUDIT.md §7.1, finding 1 — `GET /api/v1/sessions` took no
// `studentId` for a parent.
//
// The `studentIdParam === "me"` branch was guarded by `user.role === "student"`,
// so a parent got the UNION of every child's courses with no attribution: two
// children, one undifferentiated timetable, and no way to ask "which of these
// is Youssef's".
//
// The risk in fixing it is not the narrowing — it is the gate. A `studentId` a
// parent does not hold an APPROVED link to must never widen this read, and the
// check must be the one every other parent path uses rather than a fourth
// inline copy of the same query. That is what these pin.
import { describe, expect, it, vi, beforeEach } from "vitest";

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
  state: { enrollmentWhere: null as any, sessionWhere: null as any },
}));

vi.mock("@/lib/auth/session", () => ({ requireSession, getSessionUser: vi.fn() }));
vi.mock("@/lib/authz/teacher-actor", () => ({ toActingUser }));
vi.mock("@/lib/authz/center-actor", () => ({ authorizeCenterActor: vi.fn() }));
vi.mock("@/lib/services/wallet/parent-wallet", () => ({
  assertApprovedChild,
  approvedChildIds,
}));
vi.mock("@/lib/db/scope", () => ({
  scopedDb: async (_user: unknown, fn: (tx: any) => Promise<unknown>) => {
    const tx = {
      enrollment: {
        findMany: async ({ where }: { where: any }) => {
          state.enrollmentWhere = where;
          return [{ courseId: "course-1" }];
        },
      },
      session: {
        findMany: async ({ where }: { where: any }) => {
          state.sessionWhere = where;
          return [];
        },
      },
      course: { findMany: async () => [] },
      user: { findMany: async () => [] },
      room: { findMany: async () => [] },
      parentStudentLink: { findMany: async () => [] },
    };
    return fn(tx);
  },
}));

const { GET } = await import("@/app/api/v1/sessions/route");

const PARENT = { id: "parent-1", role: "parent" } as any;

function req(qs = "") {
  return new Request(`http://localhost/api/v1/sessions${qs}`);
}

beforeEach(() => {
  requireSession.mockResolvedValue(PARENT);
  toActingUser.mockResolvedValue(PARENT);
  assertApprovedChild.mockClear();
  assertApprovedChild.mockResolvedValue(undefined);
  approvedChildIds.mockClear();
  approvedChildIds.mockResolvedValue(["child-a", "child-b"]);
  state.enrollmentWhere = null;
  state.sessionWhere = null;
});

describe("GET /api/v1/sessions — a parent may narrow to one child", () => {
  it("`studentId=<child>` scopes the read to that child's enrollments alone", async () => {
    const res = await GET(req("?studentId=child-a"), {} as any);

    expect(res.status).toBe(200);
    expect(state.enrollmentWhere.studentId).toEqual({ in: ["child-a"] });
  });

  it("it goes through assertApprovedChild — the shared gate, not a local lookup", async () => {
    await GET(req("?studentId=child-a"), {} as any);

    expect(assertApprovedChild).toHaveBeenCalledTimes(1);
    expect(assertApprovedChild.mock.calls[0].slice(1)).toEqual(["parent-1", "child-a"]);
  });

  it("a child the parent has no APPROVED link to is refused, not silently widened", async () => {
    // What `assertApprovedChild` does for pending / rejected / revoked links.
    const forbidden = new Error("Not an approved child of this parent");
    (forbidden as any).status = 403;
    assertApprovedChild.mockRejectedValue(forbidden);

    const res = await GET(req("?studentId=someone-elses-child"), {} as any);

    expect(res.status).toBeGreaterThanOrEqual(400);
    // The critical half: the query never ran with the unapproved id.
    expect(state.sessionWhere).toBeNull();
    expect(state.enrollmentWhere).toBeNull();
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
    expect(state.enrollmentWhere.studentId).toEqual({ in: ["child-a", "child-b"] });
    expect(assertApprovedChild).not.toHaveBeenCalled();
  });

  it("`studentId=me` is meaningless for a parent and falls back to the union", async () => {
    await GET(req("?studentId=me"), {} as any);

    expect(state.enrollmentWhere.studentId).toEqual({ in: ["child-a", "child-b"] });
    expect(assertApprovedChild).not.toHaveBeenCalled();
  });

  it("a parent with no linked children is still refused", async () => {
    approvedChildIds.mockResolvedValue([]);

    const res = await GET(req(), {} as any);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(state.sessionWhere).toBeNull();
  });

  it("only active enrollments count, for both the narrowed and the union case", async () => {
    await GET(req("?studentId=child-a"), {} as any);
    expect(state.enrollmentWhere.status).toBe("active");

    await GET(req(), {} as any);
    expect(state.enrollmentWhere.status).toBe("active");
  });
});
