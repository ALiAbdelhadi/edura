import { platformDb, scopedDb } from "@/lib/db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors/classes";
import { requireCenterScope } from "@repo/server-core/authz/center-scope";
import type { SessionUser } from "@/lib/auth/session";
import { writeAdminAudit } from "@/lib/services/admin/admin-audit";
import { runEffects } from "@repo/server-core/db/effects";
import { superadminAsCenter } from "@/lib/authz/center-actor";
import { recordPaymentTx, listPayments, getPayment } from "@repo/server-core/services/payments/payments";
import { topUpWalletCashTx } from "@repo/server-core/services/wallet/cash-topup";
import { createWalkInSubscriptionTx } from "@repo/server-core/services/subscriptions/subscriptions";
import {
  createExpenseTx,
  listExpenses,
  updateExpenseTx,
  deleteExpenseTx,
} from "@repo/server-core/services/expenses/expenses";
import {
  getCenterWallet,
  requestCenterPayoutTx,
  listCenterPayouts,
} from "@repo/server-core/services/finance/center-wallet";

export async function adminListPayments(
  actor: SessionUser,
  centerId: string,
  filters: Record<string, string> = {},
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return listPayments(filters as never, acting);
}

export async function adminGetPayment(actor: SessionUser, centerId: string, paymentId: string) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return getPayment(paymentId, acting);
}

export async function adminRecordPayment(
  actor: SessionUser,
  centerId: string,
  data: { studentId: string; courseId?: string; amount: number; note?: string },
) {
  if (data.amount <= 0) {
    throw new BusinessRuleError(
      "Amount must be positive — use the refund flow to return money, not a negative payment",
    );
  }
  const { acting } = await superadminAsCenter(actor, centerId);
  const { value, effects } = await scopedDb(acting, async (tx) => {
    const outcome = await recordPaymentTx(tx, data, acting);
    const payment = outcome.value;
    await writeAdminAudit(tx, actor, {
      action: "center.payment_recorded",
      targetType: "payment",
      targetId: payment.id,
      centerId,
      before: null,
      after: {
        studentId: data.studentId,
        courseId: data.courseId ?? null,
        amount: data.amount,
        receiptNumber: payment.receiptNumber ?? null,
        method: "cash",
        viaSanctionedFlow: "recordPayment",
      },
    });
    return outcome;
  });
  await runEffects(effects);
  return value;
}

export async function adminMarkPaymentRefunded(
  actor: SessionUser,
  centerId: string,
  paymentId: string,
) {
  const result = await platformDb(
    async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) throw new NotFoundError("Payment not found");
      if (payment.centerId !== centerId) {
        throw new ForbiddenError("Payment belongs to a different center");
      }
      const current = payment.status || "paid";
      if (current !== "paid") {
        throw new BusinessRuleError(`Cannot transition from ${current} to refunded`);
      }

      // Conditional on the status the read saw. Two concurrent marks used to
      // converge on the same 'refunded' row but BOTH write an audit entry, so
      // the log claimed the flag was flipped twice. Only the update that
      // actually moved the row proceeds to the audit write.
      const moved = await tx.payment.updateMany({
        where: { id: paymentId, status: "paid" },
        data: { status: "refunded" },
      });
      const updated = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      if (moved.count === 0) {
        throw new BusinessRuleError(`Cannot transition from ${updated.status} to refunded`);
      }
      await writeAdminAudit(tx, actor, {
        action: "center.payment_marked_refunded",
        targetType: "payment",
        targetId: paymentId,
        centerId,
        before: { status: payment.status, amount: payment.amount },
        after: {
          status: "refunded",
          ledgerReversalWritten: false,
          moneyReturned: false,
          note: "Status flag only — use the finance refund flow to return money",
        },
      });
      return { before: payment, updated };
    },
    { actorId: actor.id },
  );

  return result.updated;
}

export async function adminTopUpWallet(
  actor: SessionUser,
  centerId: string,
  input: { studentId: string; amount: number },
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const { value, effects } = await platformDb(
    async (tx) => {
      const outcome = await topUpWalletCashTx(tx, input, acting);
      await writeAdminAudit(tx, actor, {
        action: "center.wallet_topped_up",
        targetType: "user",
        targetId: input.studentId,
        centerId,
        before: null,
        after: {
          amount: input.amount,
          balanceAfter: outcome.value.balanceAfter,
          receiptNumber: outcome.value.receiptNumber,
          method: "cash",
          direction: "credit",
          viaSanctionedFlow: "topUpWalletCash",
        },
      });
      return outcome;
    },
    { actorId: actor.id },
  );
  await runEffects(effects);
  return value;
}

export async function adminCreateWalkInSubscription(
  actor: SessionUser,
  centerId: string,
  input: {
    studentId: string;
    courseId: string;
    plan: "monthly" | "per_session";
    sessionId?: string;
    markAttendance?: boolean;
  },
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const { value, effects } = await scopedDb(acting, async (tx) => {
    const outcome = await createWalkInSubscriptionTx(tx, input as never, acting);
    const sub = outcome.value;
    await writeAdminAudit(tx, actor, {
      action: "center.walk_in_subscription_created",
      targetType: "subscription",
      targetId: sub.id,
      centerId,
      before: null,
      after: {
        studentId: input.studentId,
        courseId: input.courseId,
        plan: input.plan,
        price: sub.price ?? null,
        method: "cash",
        viaSanctionedFlow: "createWalkInSubscription",
      },
    });
    return outcome;
  });
  await runEffects(effects);
  return value;
}

export async function adminListExpenses(
  actor: SessionUser,
  centerId: string,
  filters: Record<string, string> = {},
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return listExpenses(filters as never, acting);
}

export async function adminCreateExpense(
  actor: SessionUser,
  centerId: string,
  data: { amount: number; category: string; description?: string; expenseDate: string },
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return scopedDb(acting, async (tx) => {
    const result = await createExpenseTx(tx, data, acting);
    await writeAdminAudit(tx, actor, {
      action: "center.expense_created",
      targetType: "expense",
      targetId: result.id,
      centerId,
      before: null,
      after: { ...data },
    });
    return result;
  });
}

export async function adminUpdateExpense(
  actor: SessionUser,
  centerId: string,
  expenseId: string,
  data: Record<string, unknown>,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return scopedDb(acting, async (tx) => {
    const before = await tx.expense.findUnique({
      where: { id: expenseId },
      select: { id: true, centerId: true, amount: true, category: true, description: true },
    });
    if (!before) throw new NotFoundError("Expense not found");
    requireCenterScope(acting, before.centerId);

    const result = await updateExpenseTx(tx, expenseId, data as never, acting);
    await writeAdminAudit(tx, actor, {
      action: "center.expense_updated",
      targetType: "expense",
      targetId: expenseId,
      centerId,
      before,
      after: { changed: Object.keys(data), ...data },
    });
    return result;
  });
}

export async function adminDeleteExpense(
  actor: SessionUser,
  centerId: string,
  expenseId: string,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return scopedDb(acting, async (tx) => {
    const before = await tx.expense.findUnique({
      where: { id: expenseId },
      select: { id: true, centerId: true, amount: true, category: true, description: true },
    });
    if (!before) throw new NotFoundError("Expense not found");
    requireCenterScope(acting, before.centerId);

    const result = await deleteExpenseTx(tx, expenseId, acting);
    await writeAdminAudit(tx, actor, {
      action: "center.expense_deleted",
      targetType: "expense",
      targetId: expenseId,
      centerId,
      before,
      after: { deleted: true, ledgerRowsAffected: 0 },
    });
    return result;
  });
}

export async function adminGetCenterWallet(actor: SessionUser, centerId: string) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return getCenterWallet(acting);
}

export async function adminListCenterPayouts(actor: SessionUser, centerId: string) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return listCenterPayouts(acting);
}

export async function adminRequestCenterPayout(
  actor: SessionUser,
  centerId: string,
  amount?: number,
  clientRequestId?: string,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return platformDb(
    async (tx) => {
      const walletBefore = await tx.center.findUnique({
        where: { id: centerId },
        select: { walletBalance: true },
      });
      const result = await requestCenterPayoutTx(tx, acting, amount, clientRequestId);
      await writeAdminAudit(tx, actor, {
        action: "center.payout_requested",
        targetType: "payout",
        targetId: result.id,
        centerId,
        before: { walletBalance: walletBefore?.walletBalance ?? null },
        after: {
          amount: amount ?? null,
          status: "pending",
          moneyMoved: false,
          viaSanctionedFlow: "requestCenterPayout",
        },
      });
      return result;
    },
    { actorId: actor.id },
  );
}
