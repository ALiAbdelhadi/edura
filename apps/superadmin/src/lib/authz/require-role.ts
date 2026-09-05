import { requireSession, type SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/errors/classes";
import { withErrors, type Handler, type RouteCtx } from "@/lib/errors/http";
import type { Role } from "@repo/database";
import type { NextResponse } from "next/server";

export async function requireRole(...allowed: Role[]): Promise<SessionUser> {
  const user = await requireSession();
  if (user.role === "super_admin") return user;
  if (!allowed.includes(user.role)) {
    throw new ForbiddenError(
      `Role '${user.role}' is not allowed (need one of: ${allowed.join(", ")})`,
    );
  }
  return user;
}

/**
 * `withErrors` + `requireRole` as one wrapper, so a route declares its guard in
 * its signature instead of restating it as the first line of every handler.
 *
 *     export const POST = withRole("super_admin", async (user, req, ctx) => …)
 *
 * The guard runs BEFORE the handler body exists, which is the point: there is
 * no shape of this wrapper that reaches the body unauthenticated. Composes the
 * same way `withErrors` did — `withRateLimit(withRole(…))` still works.
 */
export function withRole(
  allowed: Role | readonly Role[],
  handler: (
    user: SessionUser,
    req: Request,
    ctx: RouteCtx,
  ) => Promise<NextResponse> | NextResponse,
): Handler {
  const roles = (Array.isArray(allowed) ? allowed : [allowed]) as Role[];
  return withErrors(async (req, ctx) => handler(await requireRole(...roles), req, ctx));
}
