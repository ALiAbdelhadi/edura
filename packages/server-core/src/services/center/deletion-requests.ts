import { scopedDb } from "../../db/scope";
import type { TenantTx } from "../../db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../errors/classes";
import { requireCenterScope } from "../../authz/center-scope";
import type { SessionUser } from "../../auth/types";
import type { DeletionStatus } from "@repo/database";

export async function listDeletionRequests(
  acting: SessionUser,
  filters: { status?: string } = {},
) {
  if (!acting.centerId) throw new ForbiddenError("Actor has no center scope");
  const status = (filters.status || "pending") as DeletionStatus;

  return scopedDb(acting, async (tx) => {
    const rows = await tx.deletionRequest.findMany({
      where: { status, centerId: acting.centerId },
      orderBy: { requestedAt: "desc" },
    });

    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = userIds.length
      ? await tx.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true, role: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    return rows.map((r) => ({ ...r, userId: byId.get(r.userId) ?? r.userId }));
  });
}

export async function approveDeletionRequest(acting: SessionUser, id: string) {
  return scopedDb(acting, (tx) => approveDeletionRequestTx(tx, acting, id));
}

export async function approveDeletionRequestTx(tx: TenantTx, acting: SessionUser, id: string) {
  return (async () => {
    const existing = await tx.deletionRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Deletion request not found");
    requireCenterScope(acting, existing.centerId);
    if (existing.status !== "pending") {
      throw new BusinessRuleError(`Request already ${existing.status}`);
    }

    const updated = await tx.deletionRequest.update({
      where: { id },
      data: { status: "approved", reviewedBy: acting.id, reviewedAt: new Date() },
    });

    await tx.user.updateMany({
      where: { id: existing.userId },
      data: { status: "deleted", deletedAt: new Date() },
    });

    return updated;
  })();
}

export async function rejectDeletionRequest(
  acting: SessionUser,
  id: string,
  note?: string,
) {
  return scopedDb(acting, (tx) => rejectDeletionRequestTx(tx, acting, id, note));
}

export async function rejectDeletionRequestTx(
  tx: TenantTx,
  acting: SessionUser,
  id: string,
  note?: string,
) {
  return (async () => {
    const existing = await tx.deletionRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Deletion request not found");
    requireCenterScope(acting, existing.centerId);
    if (existing.status !== "pending") {
      throw new BusinessRuleError(`Request already ${existing.status}`);
    }

    return tx.deletionRequest.update({
      where: { id },
      data: {
        status: "rejected",
        reviewedBy: acting.id,
        reviewedAt: new Date(),
        ...(note ? { reviewNote: note } : {}),
      },
    });
  })();
}
