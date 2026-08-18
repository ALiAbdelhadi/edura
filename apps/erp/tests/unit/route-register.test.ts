import { describe, expect, it, vi, beforeEach } from "vitest";

// The four public registration doors. Services are mocked — the live-DB
// registration-doors suite owns the real account creation; this pins each
// route's contract: 201 + envelope on success, 400 validation_error on a bad
// body, and the student door fires its welcome email fire-and-forget.

const registerStudent = vi.fn(async () => ({ userId: "u-s" }));
const registerTeacher = vi.fn(async () => ({ user: { id: "u-t" }, profile: {} }));
const registerParent = vi.fn(async () => ({ userId: "u-p" }));
const registerCenter = vi.fn(async () => ({ userId: "u-c", centerId: "c-1" }));
const sendStudentWelcomeEmail = vi.fn(async () => ({ sent: true }));
const captureServerEvent = vi.fn(async () => undefined);

vi.mock("@/lib/services/auth/register", () => ({
  registerStudent: (...a: unknown[]) => registerStudent(...(a as [])),
  registerTeacher: (...a: unknown[]) => registerTeacher(...(a as [])),
  registerParent: (...a: unknown[]) => registerParent(...(a as [])),
  registerCenter: (...a: unknown[]) => registerCenter(...(a as [])),
}));
vi.mock("@/lib/services/onboarding/welcome-email", () => ({
  sendStudentWelcomeEmail: (...a: unknown[]) => sendStudentWelcomeEmail(...(a as [])),
}));
vi.mock("@/lib/observability/posthog-server", () => ({
  captureServerEvent: (...a: unknown[]) => captureServerEvent(...(a as [])),
  ANALYTICS_EVENTS: { SIGNUP_COMPLETED: "signup_completed" },
}));
vi.mock("@/lib/rate-limit/middleware", () => ({
  withRateLimit: (h: unknown) => h,
}));

function post(path: string, body: unknown) {
  return new Request(`http://t.local${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({}) };
const base = {
  email: "person@example.com",
  password: "Passw0rd!x",
  name: "شخص تجريبي",
  locale: "ar",
};

beforeEach(() => {
  registerStudent.mockClear();
  registerTeacher.mockClear();
  registerParent.mockClear();
  registerCenter.mockClear();
  sendStudentWelcomeEmail.mockClear();
  captureServerEvent.mockClear();
});

describe("POST /api/v1/auth/register/student", () => {
  it("201 on success, and the welcome email fires without being awaited into the contract", async () => {
    const { POST } = await import("@/app/api/v1/auth/register/student/route");
    const res = await POST(post("/api/v1/auth/register/student", base), ctx);
    expect(res.status).toBe(201);
    expect(((await res.json()) as { data: { userId: string } }).data.userId).toBe("u-s");
    expect(sendStudentWelcomeEmail).toHaveBeenCalledWith("u-s");
  });

  it("400 validation_error on a bad body; the service is never reached", async () => {
    const { POST } = await import("@/app/api/v1/auth/register/student/route");
    const res = await POST(
      post("/api/v1/auth/register/student", { ...base, email: "not-an-email" }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "validation_error",
    );
    expect(registerStudent).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/auth/register/parent", () => {
  it("201 on success", async () => {
    const { POST } = await import("@/app/api/v1/auth/register/parent/route");
    const res = await POST(post("/api/v1/auth/register/parent", base), ctx);
    expect(res.status).toBe(201);
    expect(registerParent).toHaveBeenCalledTimes(1);
  });

  it("400 on missing password", async () => {
    const { POST } = await import("@/app/api/v1/auth/register/parent/route");
    const noPass: Partial<typeof base> = { ...base };
    delete noPass.password;
    const res = await POST(post("/api/v1/auth/register/parent", noPass), ctx);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/auth/register/teacher", () => {
  it("201 on success, signup analytics fired via after()", async () => {
    const { POST } = await import("@/app/api/v1/auth/register/teacher/route");
    const res = await POST(post("/api/v1/auth/register/teacher", base), ctx);
    expect(res.status).toBe(201);
    expect(captureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({ role: "teacher" }),
      "signup_completed",
      expect.objectContaining({ signup_role: "teacher" }),
    );
  });

  it("400 on a bad body", async () => {
    const { POST } = await import("@/app/api/v1/auth/register/teacher/route");
    const res = await POST(post("/api/v1/auth/register/teacher", { email: "x@y.z" }), ctx);
    expect(res.status).toBe(400);
    expect(registerTeacher).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/auth/register/center", () => {
  it("validation failure never reaches the service", async () => {
    const { POST } = await import("@/app/api/v1/auth/register/center/route");
    const res = await POST(post("/api/v1/auth/register/center", { name: "" }), ctx);
    expect(res.status).toBe(400);
    expect(registerCenter).not.toHaveBeenCalled();
  });
});
