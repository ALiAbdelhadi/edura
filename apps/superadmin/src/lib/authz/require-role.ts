import { requireSession, type SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/errors/classes";
import type { Role } from "@repo/database";

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
