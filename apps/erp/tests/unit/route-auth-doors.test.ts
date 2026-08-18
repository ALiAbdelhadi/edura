import { describe, expect, it, vi } from "vitest";
import { APIError } from "better-auth/api";

// The four public auth doors that are not registration: the REST login door
// (which holds NO policy of its own — C-04 lives in lib/auth/auth.ts), the
// invite claim, and the password forgot/reset pair. Services and the
// better-auth instance are mocked; the live-DB suites (c04-parity,
// invite-claim, mail-password-reset) own the real behavior.

const signInEmail = vi.fn();
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { signInEmail: (...a: unknown[]) => signInEmail(...(a as [])) } },
}));

const platformDb = vi.fn();
vi.mock("@/lib/db/scope", () => ({
  platformDb: (cb: (tx: unknown) => unknown) => platformDb(cb),
}));

const acceptInvite = vi.fn();
vi.mock("@/lib/services/auth/invite-accept", () => ({
  acceptInvite: (...a: unknown[]) => acceptInvite(...(a as [])),
}));

const requestPasswordReset = vi.fn(async () => undefined);
const resetPassword = vi.fn(async () => undefined);
vi.mock("@/lib/services/auth/password-reset", () => ({
  requestPasswordReset: (...a: unknown[]) => requestPasswordReset(...(a as [])),
  resetPassword: (...a: unknown[]) => resetPassword(...(a as [])),
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

// NOTE: the `POST /api/v1/auth/login` block that stood here was removed with the
// route itself (retired 2026-08-18). It was a REST mirror of the better-auth
// sign-in door, used by no application code; its behaviour is now covered by
// the better-auth door's own tests and by tests/db/c04-login-parity.test.ts.

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
    const { POST } = await import("@/app/api/v1/auth/invite/accept/route");
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
    const { POST } = await import("@/app/api/v1/auth/invite/accept/route");
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
    const { POST } = await import("@/app/api/v1/auth/password/forgot/route");
    const res = await POST(post("/api/v1/auth/password/forgot", { email: "who@example.com" }), ctx);
    expect(res.status).toBe(200);
    const msg = ((await res.json()) as { data: { message: string } }).data.message;
    expect(msg).toMatch(/if an account exists/i);
    expect(requestPasswordReset).toHaveBeenCalledWith("who@example.com", undefined);
  });

  it("400 on a non-email", async () => {
    const { POST } = await import("@/app/api/v1/auth/password/forgot/route");
    const res = await POST(post("/api/v1/auth/password/forgot", { email: "nope" }), ctx);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/auth/password/reset", () => {
  it("resets with a valid token", async () => {
    const { POST } = await import("@/app/api/v1/auth/password/reset/route");
    const res = await POST(
      post("/api/v1/auth/password/reset", { token: "t", password: "Passw0rd!x" }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(resetPassword).toHaveBeenCalledWith("t", "Passw0rd!x");
  });

  it("service rejection (expired/invalid token) surfaces as its AppError status", async () => {
    const { ExpiredError } = await import("@/lib/errors/classes");
    resetPassword.mockImplementation(async () => {
      throw new ExpiredError("Reset link expired");
    });
    const { POST } = await import("@/app/api/v1/auth/password/reset/route");
    const res = await POST(
      post("/api/v1/auth/password/reset", { token: "old", password: "Passw0rd!x" }),
      ctx,
    );
    expect(res.status).toBe(410);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("expired");
  });
});
