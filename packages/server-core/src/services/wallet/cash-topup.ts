import { platformDb } from "../../db/scope";
import { BusinessRuleError, ForbiddenError } from "../../errors/classes";
import { openShiftIdFor } from "../center/shifts";
import { creditMove } from "../finance/center-credit";
import type { SessionUser } from "../../auth/types";
import { notify } from "../notifications/notify";
import { studentAndParents } from "../notifications/fanout";
import { nextTxnRef } from "../finance/ref-numbers";
import { walletCredit, assertTopupAllowed } from "./wallet";

/**
 * Record a CASH wallet top-up taken at a center's counter.
 *
 * Extracted out of apps/www/src/lib/services/wallet/wallet.ts, whose other
 * exports drive the ONLINE top-up and therefore need the Paymob gateway — which
 * stays in www. This is the cash path and needs none of it. www re-exports this
 * exact function.
 *
 * CREDIT ONLY. There is deliberately no center-facing wallet debit or
 * withdrawal: money can be put into a student's wallet at the counter, and only
 * the student's own spending or a refund moves it out. Every credit is a
 * traceable trio — a Payment with a receipt, a Transaction, and a WalletLedger
 * entry — all inside ONE transaction, with `recordedBy` naming the real actor.
 */
export async function topUpWalletCash(
  input: { studentId: string; amount: number },
  user: SessionUser,
) {
  if (user.role !== "center_admin" || !user.centerId) throw new ForbiddenError();
  const centerId = user.centerId;

  const { balanceAfter, receiptNumber, studentId } = await platformDb(
    async (tx) => {
      // The student must be on THIS center's roster — a center can only top up
      // students it actually serves.
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
          // MC-3: cash over the counter — same value the ledger mirror records.
          paymentMethod: "cash",
          note: `Wallet top-up (cash at center)`,
          receiptNumber,
          recordedBy: user.id,
          // Phase 2: stamp the recorder's open drawer session (NULL when none).
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

      // D5: the drawer just took CASH that became a PLATFORM liability to the
      // student — the center now holds platform money, and this debit is what
      // makes "wallet = platform-held" true uniformly at settlement time.
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
    },
    { actorId: user.id },
  );

  await notify({
    recipients: await studentAndParents(studentId),
    type: "payment_recorded",
    title: "Wallet topped up",
    body: `${(input.amount / 100).toFixed(2)} EGP was added to your wallet at the center. Receipt ${receiptNumber}.`,
    data: { amount: input.amount, balanceAfter, receiptNumber, studentId },
  });

  return { balanceAfter, receiptNumber };
}
