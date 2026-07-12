import {
  prisma,
  withTenant,
  withPlatformContext,
  runWithContext,
  type TenantTx,
} from "@repo/database";
import type { SessionUser } from "@/lib/auth/session";

export { prisma };
export type { TenantTx };

/**
 * The single data-access entry point for API routes.
 *
 * Runs `fn` under the correct Row-Level-Security context for the caller AND
 * establishes the ambient request context (actor/center/ip) that the audit-log
 * extension reads. Because RLS is enforced (FORCE + a NOBYPASSRLS runtime role),
 * every query MUST run inside one of these contexts or it sees nothing.
 *
 * Scoping model:
 *   - center_admin with a centerId  → withTenant: RLS enforces center isolation.
 *   - super_admin / accountant       → platform context: legitimately cross-tenant,
 *                                       gated by app-layer RBAC (requireRole).
 *   - teacher / student / parent      → platform context: their data spans centers,
 *                                       so isolation is by OWNERSHIP filters
 *                                       (teacherId/studentId/parentId = user.id)
 *                                       which each handler must still apply.
 *   - unauthenticated (public reads)  → platform context.
 *
 * Keep external side effects (email, FCM, HTTP) OUTSIDE `fn` — it runs inside a
 * DB transaction. Do DB work in `fn`, return data, then fire side effects.
 */
export function scopedDb<T>(
  user: SessionUser | null | undefined,
  fn: (tx: TenantTx) => Promise<T>,
  opts?: { ipAddress?: string },
): Promise<T> {
  const ctx = {
    actorId: user?.id,
    centerId: user?.centerId,
    ipAddress: opts?.ipAddress,
  };
  const exec: (f: (tx: TenantTx) => Promise<T>) => Promise<T> =
    user?.role === "center_admin" && user.centerId
      ? (f) => withTenant(user.centerId as string, f)
      : (f) => withPlatformContext(f);
  return runWithContext(ctx, () => exec(fn));
}

/**
 * Explicit platform-context escape hatch for cross-tenant reads/writes that
 * aren't tied to a single caller center (e.g. public discovery, the money-
 * distribution job). Prefer `scopedDb` in request handlers.
 */
export function platformDb<T>(
  fn: (tx: TenantTx) => Promise<T>,
  ctx?: { actorId?: string; ipAddress?: string },
): Promise<T> {
  return runWithContext(ctx ?? {}, () => withPlatformContext(fn));
}
