import type { SessionUser } from "../../auth/types";
import { scopedDb } from "../../db/scope";
import { ConflictError } from "../../errors/classes";

export function createDeletionRequest(user: SessionUser, reason: string) {
  return scopedDb(user, async (tx) => {
    const existing = await tx.deletionRequest.findFirst({
      where: {
        userId: user.id,
        status: "pending",
      },
    });
    if (existing) {
      throw new ConflictError("You already have a pending deletion request");
    }

    return tx.deletionRequest.create({
      data: {
        userId: user.id,
        reason,
        centerId: user.centerId ?? null,
      },
    });
  });
}
