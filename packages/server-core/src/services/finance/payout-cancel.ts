import type { SessionUser } from "../../auth/types";
import { platformDb } from "../../db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../errors/classes";

/**
 * T-4 — the owner's undo for a payout request (approved decision 2026-08-21).
 *
 * The rule, exactly as approved: the request's OWNER — the teacher, or the
 * center whose admin is calling — may cancel their own request while it is
 * still `pending`. Nothing else: an `approved` request is already in the
 * accountant's hands and only they may release it (reject), and `paid` /
 * `rejected` / `cancelled` are terminal.
 *
 * WHY THE LOCK. "Available" is derived: wallet balance minus the sum of open
 * (pending + approved) payouts — the H1 reserve. Requesting locks the
 * beneficiary row FOR UPDATE before aggregating, so cancelling must serialize
 * on the SAME row: a cancel flipping a row to `cancelled` while a concurrent
 * request is mid-aggregate would otherwise let the request read a reserve that
 * a committed cancel had already released — or vice versa. One lock, both
 * writers, no interleaving.
 *
 * The status flip is CONDITIONAL (`updateMany where status='pending'`) even
 * under the lock — the same belt-and-braces the H2 decrement uses. If the
 * accountant approved the request between our read and our write (they do not
 * take the beneficiary lock), the flip touches zero rows and the caller gets
 * the truthful refusal instead of a silently un-reserved approved payout.
 *
 * Audited: one audit_logs row per successful cancel, actor = the caller.
 * NotFound (never Forbidden) for a payout the caller does not own.
 */
export function cancelOwnPayoutRequest(user: SessionUser, payoutId: string) {
  let beneficiaryId: string;
  let beneficiaryType: "teacher" | "center";
  if (user.role === "teacher") {
    beneficiaryId = user.id;
    beneficiaryType = "teacher";
  } else if (user.role === "center_admin" && user.centerId) {
    beneficiaryId = user.centerId;
    beneficiaryType = "center";
  } else {
    throw new ForbiddenError();
  }

  return platformDb(
    async (tx) => {
      // Same FOR UPDATE discipline as requestTeacherPayout / requestCenterPayout.
      const locked =
        beneficiaryType === "teacher"
          ? await tx.$queryRaw<{ user_id: string }[]>`
              SELECT user_id FROM teacher_profiles WHERE user_id = ${beneficiaryId}::uuid FOR UPDATE`
          : await tx.$queryRaw<{ id: string }[]>`
              SELECT id FROM centers WHERE id = ${beneficiaryId}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundError("Beneficiary not found");

      const payout = await tx.payout.findUnique({ where: { id: payoutId } });
      if (!payout || payout.beneficiaryId !== beneficiaryId || payout.beneficiaryType !== beneficiaryType) {
        throw new NotFoundError("Payout request not found");
      }
      if (payout.status !== "pending") {
        throw new BusinessRuleError(
          payout.status === "approved"
            ? "This request has been approved and is in the accountant's hands — only they can release it now"
            : `A ${payout.status} request cannot be cancelled`,
        );
      }

      const cancelledAt = new Date();
      const flipped = await tx.payout.updateMany({
        where: { id: payoutId, status: "pending" },
        data: { status: "cancelled", cancelledAt },
      });
      if (flipped.count === 0) {
        throw new BusinessRuleError("The request changed state while cancelling — reload and retry");
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "payout.cancel",
          targetType: "payout",
          targetId: payoutId,
          afterState: {
            beneficiaryId,
            beneficiaryType,
            netPayable: payout.netPayable,
            cancelledAt: cancelledAt.toISOString(),
          },
        },
      });

      // The reserve is derived from open payouts, so the flip above IS the
      // release — `available` recovers by netPayable with no second write.
      return { ...payout, status: "cancelled" as const, cancelledAt };
    },
    { actorId: user.id },
  );
}
