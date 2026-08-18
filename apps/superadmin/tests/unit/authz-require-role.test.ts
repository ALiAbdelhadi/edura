import { describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@repo/server-core/auth/types";

// The back-office requireRole differs from www's in exactly one way: a
// super_admin passes EVERY gate (full platform control, decision #1), while
// the accountant only passes routes that name it. That asymmetry is the
// finance-portal restriction, so it gets its own pin here.

const requireSession = vi.fn<() => Promise<SessionUser>>();
vi.mock("@/lib/auth/session", () => ({
  requireSession: (...args: unknown[]) => requireSession(...(args as [])),
}));

const { requireRole } = await import("@/lib/authz/require-role");
const { AuthError, ForbiddenError } = await import("@/lib/errors/classes");

const user = (role: SessionUser["role"]): SessionUser => ({
  id: "u1",
  role,
  locale: "ar",
});

// No beforeEach mock-clearing here, deliberately: every test installs its own
// implementation, and vitest 4 mis-attributes a later mock rejection as an
// unhandled test error when the mock was cleared in a beforeEach (verified in
// this repo, 2026-08-08 — see the www twin of this file).

describe("requireRole (superadmin)", () => {
  it("super_admin passes even when not named (full-control bypass)", async () => {
    requireSession.mockResolvedValue(user("super_admin"));
    await expect(requireRole("accountant")).resolves.toMatchObject({
      role: "super_admin",
    });
  });

  it("accountant passes a finance route that names it", async () => {
    requireSession.mockResolvedValue(user("accountant"));
    await expect(requireRole("accountant")).resolves.toMatchObject({
      role: "accountant",
    });
  });

  it("accountant is 403 on an admin-only route", async () => {
    requireSession.mockResolvedValue(user("accountant"));
    await expect(requireRole("super_admin")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("propagates AuthError (401) when there is no session", async () => {
    requireSession.mockImplementation(async () => {
      throw new AuthError();
    });
    await expect(requireRole("super_admin")).rejects.toBeInstanceOf(AuthError);
  });
});
