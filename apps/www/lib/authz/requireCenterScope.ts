import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/errors/classes";

/**
 * Enforces that the caller's center matches the resource's center.
 * Every call site invokes this after requireRole("center_admin"), so
 * user.centerId is expected to be set — missing it is itself a scope failure.
 */
export function requireCenterScope(
  user: SessionUser,
  resourceCenterId: string | { toString(): string } | null | undefined,
): void {
  if (!resourceCenterId) throw new ForbiddenError("Resource has no center scope");
  if (!user.centerId || user.centerId !== resourceCenterId.toString()) {
    throw new ForbiddenError("Resource belongs to a different center");
  }
}
