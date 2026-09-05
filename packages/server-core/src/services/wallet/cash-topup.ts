import { platformDb } from "../../db/scope";
import { runEffects, type WithEffects } from "../../db/effects";
import type { TenantTx } from "../../db/scope";
import { BusinessRuleError, ForbiddenError } from "../../errors/classes";
import { openShiftIdFor } from "../center/shifts";
import { creditMove } from "../finance/center-credit";
import type { SessionUser } from "../../auth/types";
import { notify } from "../notifications/notify";
import { studentAndParents } from "../notifications/fanout";
import { nextTxnRef } from "../finance/ref-numbers";
import { walletCredit, assertTopupAllowed } from "./wallet";

export async function topUpWalletCash(
  input: { studentId: string; amount: number },
  user: SessionUser,
) {
  const { value, effects } = await platformDb((tx) => topUpWalletCashTx(tx, input, user), {
    actorId: user.id,
  });
  await runEffects(effects);
  return value;
}

export async function topUpWalletCashTx(
  tx: TenantTx,
  input: { studentId: string; amount: number },
  user: SessionUser,
): Promise<WithEffects<{ balanceAfter: number; receiptNumber: string }>> {
  if (user.role !== "center_admin" || !user.centerId) throw new ForbiddenError();
  const centerId = user.centerId;

  const { balanceAfter, receiptNumber, studentId } = await (async () => {
    {
      const roster = await tx.centerStudentRoster.findFirst({
        where: { centerId, studentId: input.studentId, leftAt: null },
        select: { id: true },
      });
      if (!roster) throw new BusinessRuleError("Student is not on this center's roster");

      await assertTopupAllowed(tx, input.studentId, input.amount);

      const center = await tx.center.update({
        where: { id: centerId },
        data: { receiptSeq: { increment: 1 } },
      });
      const receiptNumber = `RCP-${center.shortId}-${new Date().getFullYear()}-${String(
        center.receiptSeq,
      ).padStart(5, "0")}`;

      const payment = await tx.payment.create({
        data: {
          centerId,
          studentId: input.studentId,
          courseId: null,
          amount: input.amount,
          paymentMethod: "cash",
          note: `Wallet top-up (cash at center)`,
          receiptNumber,
          recordedBy: user.id,
          shiftId: await openShiftIdFor(tx, user.id),
          paidAt: new Date(),
        },
      });

      const refNumber = await nextTxnRef(tx);
      const transaction = await tx.transaction.create({
        data: {
          refNumber,
          type: "payment",
          amount: input.amount,
          fromEntityId: input.studentId,
          toEntityId: null, // platform-held float; centerId records the cash drawer
          centerId,
          status: "completed",
          paymentMethod: "cash",
          notes: `Wallet top-up (cash at center, receipt ${receiptNumber})`,
        },
      });

      await creditMove(tx, {
        centerId,
        type: "wallet_cash_collection",
        delta: -input.amount,
        method: "cash",
        refNumber,
        relatedTxnId: transaction.id,
        recordedBy: user.id,
        reason: `Cash wallet top-up collected at the counter (receipt ${receiptNumber})`,
      });

      const { balanceAfter } = await walletCredit(tx, input.studentId, input.amount, {
        type: "topup",
        method: "cash",
        refNumber,
        paymentId: payment.id,
        relatedTxnId: transaction.id,
        centerId, // crediting center (audit)
        recordedBy: user.id, // crediting staff (audit)
        reason: "Cash wallet top-up at center",
      });

      return { balanceAfter, receiptNumber, studentId: input.studentId };
    }
  })();

  return {
    value: { balanceAfter, receiptNumber },
    effects: [
      async () => {
        await notify({
          recipients: await studentAndParents(studentId),
          type: "payment_recorded",
          title: "Wallet topped up",
          body: `${(input.amount / 100).toFixed(2)} EGP was added to your wallet at the center. Receipt ${receiptNumber}.`,
          data: { amount: input.amount, balanceAfter, receiptNumber, studentId },
        });
      },
    ],
  };
}
