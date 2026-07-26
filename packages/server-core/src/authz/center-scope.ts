import type { SessionUser } from "../auth/types";
import { ForbiddenError } from "../errors/classes";

/**
 * A resource belongs to the acting user's center, or it is out of reach.
 *
 * Moved here from apps/www so the extracted center services can enforce it in
 * the kernel (Phase 2). It reads `user.centerId`, which for a super admin is
 * the TARGET center supplied by `superadminAsCenter` — so acting on center A
 * still cannot touch a resource belonging to center B.
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
