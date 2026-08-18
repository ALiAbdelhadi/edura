import { describe, expect, it, vi, beforeEach } from "vitest";

// POST /api/v1/courses gained a TEACHER branch (teacher-direct groups,
// roadmap decision #2). The risk that branch introduces is not in what it
// adds — it is in whether the CENTER path still reaches the code it always
// reached. These assertions pin that boundary without a database:
//
//   • a teacher is routed to createTeacherDirectCourse, never to createCourse;
//   • every other role falls through to requireRole("center_admin") and then
//     to createCourse, exactly as before the branch existed;
//   • the owner of a teacher-direct group is the CALLER — the schema is
//     .strict() and carries no teacherId, so a teacher cannot mint a group
//     under someone else's name;
//   • an anonymous request never reaches either service.

const { getSessionUser, requireRole, createCourse, createTeacherDirectCourse, trackFirstGroup } =
  vi.hoisted(() => ({
    getSessionUser: vi.fn(),
    requireRole: vi.fn(),
    createCourse: vi.fn(async () => ({
      course: { id: "c1", centerId: "center-1", teacherId: "t1" },
      sessionsGenerated: 3,
    })),
    createTeacherDirectCourse: vi.fn(async () => ({
      course: { id: "c2", centerId: null, teacherId: "teacher-me" },
      sessionsGenerated: 5,
    })),
    trackFirstGroup: vi.fn(async () => undefined),
  }));

vi.mock("@/lib/auth/session", () => ({ getSessionUser, requireSession: vi.fn() }));
vi.mock("@/lib/authz/require-role", () => ({ requireRole }));
vi.mock("@repo/server-core/services/center/courses", () => ({
  createCourse,
  createTeacherDirectCourse,
}));
vi.mock("@/lib/observability/funnel", () => ({ trackFirstGroup }));
vi.mock("@/lib/db/scope", () => ({ scopedDb: vi.fn() }));
vi.mock("@/lib/authz/teacher-actor", () => ({ toActingUser: vi.fn() }));

const schedulePattern = {
  daysOfWeek: [1, 3],
  startTime: "16:00",
  endTime: "18:00",
  startDate: "2099-01-05",
  endDate: "2099-06-05",
};

function post(body: unknown) {
  return new Request("http://localhost/api/v1/courses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/courses — role routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes a teacher to the teacher-direct service and never to the center one", async () => {
    getSessionUser.mockResolvedValue({ id: "teacher-me", role: "teacher" });
    const { POST } = await import("@/app/api/v1/courses/route");

    const res = await POST(
      post({
        title: "فيزياء — الثالث الثانوي",
        subject: "فيزياء",
        schedulePattern,
        maxStudents: 30,
        pricePerMonth: 30000,
      }),
      { params: Promise.resolve({}) } as never,
    );

    expect(res.status).toBe(201);
    expect(createTeacherDirectCourse).toHaveBeenCalledTimes(1);
    expect(createCourse).not.toHaveBeenCalled();
    // requireRole("center_admin") must not even be consulted for a teacher.
    expect(requireRole).not.toHaveBeenCalled();

    // The owner is the session, and the body could not have carried one.
    const [acting, body] = createTeacherDirectCourse.mock.calls[0] as unknown as [
      { id: string },
      Record<string, unknown>,
    ];
    expect(acting.id).toBe("teacher-me");
    expect(body).not.toHaveProperty("teacherId");
  });

  it("rejects a teacher body that tries to name another teacher as owner", async () => {
    getSessionUser.mockResolvedValue({ id: "teacher-me", role: "teacher" });
    const { POST } = await import("@/app/api/v1/courses/route");

    // `withErrors` turns the schema rejection into a 4xx response rather than
    // throwing, so the assertion is on the status, not on a rejection.
    const res = await POST(
      post({
        teacherId: "someone-else",
        title: "x",
        subject: "y",
        schedulePattern,
        maxStudents: 10,
        pricePerMonth: 1000,
      }),
      { params: Promise.resolve({}) } as never,
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(createTeacherDirectCourse).not.toHaveBeenCalled();
  });

  it("leaves the center_admin path untouched — requireRole then createCourse", async () => {
    getSessionUser.mockResolvedValue({ id: "admin-1", role: "center_admin" });
    requireRole.mockResolvedValue({ id: "admin-1", role: "center_admin", centerId: "center-1" });
    const { POST } = await import("@/app/api/v1/courses/route");

    const res = await POST(
      post({
        teacherId: "t1",
        title: "Math",
        subject: "Math",
        schedulePattern,
        price: 30000,
        maxStudents: 30,
      }),
      { params: Promise.resolve({}) } as never,
    );

    expect(res.status).toBe(201);
    expect(requireRole).toHaveBeenCalledWith("center_admin");
    expect(createCourse).toHaveBeenCalledTimes(1);
    expect(createTeacherDirectCourse).not.toHaveBeenCalled();
  });

  it("sends an anonymous request through the center guard, reaching no service", async () => {
    getSessionUser.mockResolvedValue(null);
    requireRole.mockRejectedValue(new Error("unauthenticated"));
    const { POST } = await import("@/app/api/v1/courses/route");

    const res = await POST(post({ title: "x" }), { params: Promise.resolve({}) } as never);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(createCourse).not.toHaveBeenCalled();
    expect(createTeacherDirectCourse).not.toHaveBeenCalled();
  });
});
