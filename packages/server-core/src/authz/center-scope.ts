import type { SessionUser } from "../auth/types";
import { ForbiddenError } from "../errors/classes";

export function requireCenterScope(
  user: SessionUser,
  resourceCenterId: string | { toString(): string } | null | undefined,
): void {
  if (!resourceCenterId) throw new ForbiddenError("Resource has no center scope");
  if (!user.centerId || user.centerId !== resourceCenterId.toString()) {
    throw new ForbiddenError("Resource belongs to a different center");
  }
}
