import { requireSession, type SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/errors/classes";
import type { Role } from "@repo/database";

/**
 * The message is unchanged (proofs and existing call sites read it); what is
 * new is `details`, so the CLIENT can tell this refusal apart from every other
 * 403.
 *
 * Why that matters: a role mismatch is almost never the user doing something
 * forbidden — a parent's portal only ever calls parent routes. It means the
 * session behind the screen is not the person the screen is named after, and
 * the honest response is to end that session rather than to print
 * "Role 'center_admin' is not allowed (need one of: student, parent)" — an
 * English internal string — to an Arabic-first parent whose own name is still
 * in the sidebar. Observed exactly that way on 2026-08-09:
 * docs/reports/session-identity-mismatch.md.
 */
export async function requireRole(...allowed: Role[]): Promise<SessionUser> {
  const user = await requireSession();
  if (!allowed.includes(user.role)) {
    throw new ForbiddenError(
      `Role '${user.role}' is not allowed (need one of: ${allowed.join(", ")})`,
      { reason: "role_mismatch", role: user.role, allowed },
    );
  }
  return user;
}
