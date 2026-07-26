import { scopedDb } from "../../db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../errors/classes";
import { requireCenterScope } from "../../authz/center-scope";
import type { SessionUser } from "../../auth/types";
import type { DeletionStatus } from "@repo/database";

// ---------------------------------------------------------------------------
// ACCOUNT DELETION REQUESTS raised against a center's people.
//
// Extracted verbatim from the apps/www route handlers (deletion-requests/**).
// Same contract as the other center services: `acting` is center_admin-shaped
// and carries the TARGET centerId.
//
// Approving is a SOFT delete — `users.status = 'deleted'` + `deletedAt`. The
// row survives, so the person's financial history stays attributable and every
// ledger reference still resolves. It also passes through
// `sessionRevocationExtension`, so the account's live session is cut on its
// very next request (C-03), not merely at the next login.
// ---------------------------------------------------------------------------

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
  return scopedDb(acting, async (tx) => {
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

    // Soft delete. The extension folds a token_version bump into this same
    // statement (C-03), so the account is unauthenticated on its next request.
    await tx.user.updateMany({
      where: { id: existing.userId },
      data: { status: "deleted", deletedAt: new Date() },
    });

    return updated;
  });
}

export async function rejectDeletionRequest(
  acting: SessionUser,
  id: string,
  note?: string,
) {
  return scopedDb(acting, async (tx) => {
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
  });
}
