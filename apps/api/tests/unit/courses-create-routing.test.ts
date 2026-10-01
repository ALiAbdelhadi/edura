import { describe, expect, it, vi, beforeEach } from "vitest";

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

vi.mock("@repo/server-core/erp-auth/session", () => ({ getSessionUser, requireSession: vi.fn() }));
vi.mock("@repo/server-core/authz/require-role", () => ({ requireRole }));
vi.mock("@repo/server-core/services/center/courses", () => ({
  createCourse,
  createTeacherDirectCourse,
}));
vi.mock("@repo/server-core/services/analytics/funnel", () => ({ trackFirstGroup }));
vi.mock("@repo/server-core/db/scope", () => ({ scopedDb: vi.fn() }));
vi.mock("@repo/server-core/authz/teacher-actor", () => ({ toActingUser: vi.fn() }));

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
    const { POST } = await import("../../src/routes/v1/courses/route");

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
    expect(requireRole).not.toHaveBeenCalled();

    const [acting, body] = createTeacherDirectCourse.mock.calls[0] as unknown as [
      { id: string },
      Record<string, unknown>,
    ];
    expect(acting.id).toBe("teacher-me");
    expect(body).not.toHaveProperty("teacherId");
  });

  it("rejects a teacher body that tries to name another teacher as owner", async () => {
    getSessionUser.mockResolvedValue({ id: "teacher-me", role: "teacher" });
    const { POST } = await import("../../src/routes/v1/courses/route");

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
    const { POST } = await import("../../src/routes/v1/courses/route");

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
    const { POST } = await import("../../src/routes/v1/courses/route");

    const res = await POST(post({ title: "x" }), { params: Promise.resolve({}) } as never);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(createCourse).not.toHaveBeenCalled();
    expect(createTeacherDirectCourse).not.toHaveBeenCalled();
  });
});
