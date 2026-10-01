import { describe, expect, it, vi, beforeEach } from "vitest";

const { captured, requireSession, toActingUser } = vi.hoisted(() => ({
  captured: { sessionFind: [] as any[], enrollmentFind: 0 },
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
vi.mock("@repo/server-core/services/sessions/enrich", () => ({
  enrichSessions: async (_tx: unknown, rows: unknown[]) => rows,
}));
vi.mock("@repo/server-core/db/scope", () => ({
  scopedDb: async (_u: unknown, fn: (tx: any) => Promise<unknown>) =>
    fn({
      enrollment: {
        findMany: async () => {
          captured.enrollmentFind += 1;
          return [{ courseId: "c1" }];
        },
      },
      course: { findMany: async () => [{ id: "c1" }] },
      session: {
        findMany: async (args: any) => {
          captured.sessionFind.push(args);
          return [];
        },
      },
    }),
}));

const { GET } = await import("../../src/routes/v1/sessions/route");

const call = (qs = "") => GET(new Request(`http://localhost/api/v1/sessions${qs}`), {} as any);

beforeEach(() => {
  captured.sessionFind = [];
  captured.enrollmentFind = 0;
  const student = { id: "student-1", role: "student" };
  requireSession.mockResolvedValue(student);
  toActingUser.mockResolvedValue(student);
});

describe("GET /sessions — a caller can ask for a window", () => {
  it("no limit sent → no take, exactly as before", async () => {
    await call("?studentId=me");
    expect(captured.sessionFind[0]).not.toHaveProperty("take");
  });

  it("limit bounds the rows, capped at 500", async () => {
    await call("?studentId=me&from=2026-09-27&limit=50");
    expect(captured.sessionFind[0].take).toBe(50);
    expect(captured.sessionFind[0].where.date).toEqual({ gte: new Date("2026-09-27") });

    await call("?limit=100000");
    expect(captured.sessionFind[1].take).toBe(500);
  });

  it("a malformed limit is ignored rather than refused", async () => {
    await call("?limit=abc");
    await call("?limit=0");
    await call("?limit=2.5");
    for (const args of captured.sessionFind) expect(args).not.toHaveProperty("take");
  });

  it("studentId=me reads the student's enrollments once, not twice", async () => {
    await call("?studentId=me");
    expect(captured.enrollmentFind).toBe(1);
    expect(captured.sessionFind[0].where.courseId).toEqual({ in: ["c1"] });
  });
});
