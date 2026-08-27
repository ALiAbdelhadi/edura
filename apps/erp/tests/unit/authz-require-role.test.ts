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

describe("requireRole (www)", () => {
  it("returns the session user when the role is allowed", async () => {
    requireSession.mockResolvedValue(user("teacher"));
    await expect(requireRole("teacher", "assistant")).resolves.toMatchObject({
      id: "u1",
      role: "teacher",
    });
  });

  it("throws ForbiddenError (403) for a role not on the list", async () => {
    requireSession.mockResolvedValue(user("student"));
    await expect(requireRole("teacher")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("has NO super_admin bypass — back-office roles are still 403 in www", async () => {
    requireSession.mockResolvedValue(user("super_admin"));
    await expect(requireRole("center_admin")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("propagates AuthError (401) when there is no session", async () => {
    requireSession.mockImplementation(async () => {
      throw new AuthError();
    });
    const err = await requireRole("teacher").then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AuthError);
  });
});
