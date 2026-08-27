import { describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@repo/server-core/auth/types";

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
