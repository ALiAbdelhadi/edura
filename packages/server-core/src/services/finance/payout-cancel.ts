import type { SessionUser } from "../../auth/types";
import { platformDb } from "../../db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../errors/classes";

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

      return { ...payout, status: "cancelled" as const, cancelledAt };
    },
    { actorId: user.id },
  );
}
