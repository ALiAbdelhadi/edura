import { describe, expect, it, vi } from "vitest";

const platformDb = vi.fn();
vi.mock("@repo/server-core/db/scope", () => ({
  platformDb: (cb: (tx: unknown) => unknown) => platformDb(cb),
}));

const acceptInvite = vi.fn();
vi.mock("@repo/server-core/services/auth/invite-accept", () => ({
  acceptInvite: (...a: unknown[]) => acceptInvite(...(a as [])),
}));

const requestPasswordReset = vi.fn(async () => undefined);
const resetPassword = vi.fn(async () => undefined);
vi.mock("@repo/server-core/services/auth/password-reset", () => ({
  requestPasswordReset: (...a: unknown[]) => requestPasswordReset(...(a as [])),
  resetPassword: (...a: unknown[]) => resetPassword(...(a as [])),
}));

vi.mock("@repo/server-core/rate-limit/middleware", () => ({
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

describe("POST /api/v1/auth/invite/accept", () => {
  it("claims the invite and returns the activated user", async () => {
    acceptInvite.mockResolvedValue({ userId: "u-9" });
    platformDb.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        user: {
          findUnique: async () => ({
            email: "s@x.t",
            role: "student",
            status: "active",
            name: "طالب",
            locale: "ar",
          }),
        },
        centerTeacherAffiliation: { findFirst: async () => null },
      }),
    );
    const { POST } = await import("../../src/routes/v1/auth/invite/accept/route");
    const res = await POST(
      post("/api/v1/auth/invite/accept", { token: "tkn", password: "Passw0rd!x" }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { user: { id: string; role: string } } };
    expect(body.data.user).toMatchObject({ id: "u-9", role: "student" });
    expect(acceptInvite).toHaveBeenCalledWith("tkn", "Passw0rd!x");
  });

  it("400 on a weak password — the token is never burned on a bad body", async () => {
    acceptInvite.mockClear();
    const { POST } = await import("../../src/routes/v1/auth/invite/accept/route");
    const res = await POST(
      post("/api/v1/auth/invite/accept", { token: "tkn", password: "short" }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(acceptInvite).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/auth/password/forgot", () => {
  it("returns the SAME generic 200 whether or not the account exists", async () => {
    const { POST } = await import("../../src/routes/v1/auth/password/forgot/route");
    const res = await POST(post("/api/v1/auth/password/forgot", { email: "who@example.com" }), ctx);
    expect(res.status).toBe(200);
    const msg = ((await res.json()) as { data: { message: string } }).data.message;
    expect(msg).toMatch(/if an account exists/i);
    // M-11: the reset runs AFTER the response (runAfter) and is tagged with the
    // door it came through, so a back-office account cannot be reset from here.
    await new Promise((r) => setTimeout(r, 10));
    expect(requestPasswordReset).toHaveBeenCalledWith("who@example.com", undefined, { app: "www" });
  });

  it("400 on a non-email", async () => {
    const { POST } = await import("../../src/routes/v1/auth/password/forgot/route");
    const res = await POST(post("/api/v1/auth/password/forgot", { email: "nope" }), ctx);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/auth/password/reset", () => {
  it("resets with a valid token", async () => {
    const { POST } = await import("../../src/routes/v1/auth/password/reset/route");
    const res = await POST(
      post("/api/v1/auth/password/reset", { token: "t", password: "Passw0rd!x" }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(resetPassword).toHaveBeenCalledWith("t", "Passw0rd!x");
  });

  it("service rejection (expired/invalid token) surfaces as its AppError status", async () => {
    const { ExpiredError } = await import("@repo/server-core/errors/classes");
    resetPassword.mockImplementation(async () => {
      throw new ExpiredError("Reset link expired");
    });
    const { POST } = await import("../../src/routes/v1/auth/password/reset/route");
    const res = await POST(
      post("/api/v1/auth/password/reset", { token: "old", password: "Passw0rd!x" }),
      ctx,
    );
    expect(res.status).toBe(410);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("expired");
  });
});
