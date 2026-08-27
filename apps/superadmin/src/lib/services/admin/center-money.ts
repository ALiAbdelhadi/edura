import { platformDb } from "@/lib/db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors/classes";
import { requireCenterScope } from "@repo/server-core/authz/center-scope";
import type { SessionUser } from "@/lib/auth/session";
import { superadminAsCenter } from "@/lib/authz/center-actor";
import { recordPayment, listPayments, getPayment } from "@repo/server-core/services/payments/payments";
import { topUpWalletCash } from "@repo/server-core/services/wallet/cash-topup";
import { createWalkInSubscription } from "@repo/server-core/services/subscriptions/subscriptions";
import {
  createExpense,
  listExpenses,
  updateExpense,
  deleteExpense,
} from "@repo/server-core/services/expenses/expenses";
import {
  getCenterWallet,
  requestCenterPayout,
  listCenterPayouts,
} from "@repo/server-core/services/finance/center-wallet";

type AuditSpec = {
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
};

async function audit(actor: SessionUser, centerId: string, spec: AuditSpec) {
  await platformDb(
    (tx) =>
      tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: spec.action,
          targetType: spec.targetType,
          targetId: spec.targetId,
          centerId,
          beforeState: (spec.before ?? undefined) as never,
          afterState: (spec.after ?? undefined) as never,
          onBehalfOf: null,
        },
      }),
    { actorId: actor.id },
  );
}

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
  const result = await recordPayment(data, acting);
  const payment = (result as { payment?: { id?: string; receiptNumber?: string } }).payment ?? result;

  await audit(actor, centerId, {
    action: "center.payment_recorded",
    targetType: "payment",
    targetId: (payment as { id?: string }).id ?? centerId,
    before: null,
    after: {
      studentId: data.studentId,
      courseId: data.courseId ?? null,
      amount: data.amount,
      receiptNumber: (payment as { receiptNumber?: string }).receiptNumber ?? null,
      method: "cash",
      viaSanctionedFlow: "recordPayment",
    },
  });
  return result;
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
      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: { status: "refunded" },
      });
      return { before: payment, updated };
    },
    { actorId: actor.id },
  );

  await audit(actor, centerId, {
    action: "center.payment_marked_refunded",
    targetType: "payment",
    targetId: paymentId,
    before: { status: result.before.status, amount: result.before.amount },
    after: {
      status: "refunded",
      ledgerReversalWritten: false,
      moneyReturned: false,
      note: "Status flag only — use the finance refund flow to return money",
    },
  });
  return result.updated;
}

export async function adminTopUpWallet(
  actor: SessionUser,
  centerId: string,
  input: { studentId: string; amount: number },
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const result = await topUpWalletCash(input, acting);
  await audit(actor, centerId, {
    action: "center.wallet_topped_up",
    targetType: "user",
    targetId: input.studentId,
    before: null,
    after: {
      amount: input.amount,
      balanceAfter: result.balanceAfter,
      receiptNumber: result.receiptNumber,
      method: "cash",
      direction: "credit",
      viaSanctionedFlow: "topUpWalletCash",
    },
  });
  return result;
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
  const result = await createWalkInSubscription(input as never, acting);
  const sub = (result as { subscription?: { id?: string; price?: number } }).subscription ?? result;
  await audit(actor, centerId, {
    action: "center.walk_in_subscription_created",
    targetType: "subscription",
    targetId: (sub as { id?: string }).id ?? centerId,
    before: null,
    after: {
      studentId: input.studentId,
      courseId: input.courseId,
      plan: input.plan,
      price: (sub as { price?: number }).price ?? null,
      method: "cash",
      viaSanctionedFlow: "createWalkInSubscription",
    },
  });
  return result;
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
  const result = await createExpense(data as never, acting);
  await audit(actor, centerId, {
    action: "center.expense_created",
    targetType: "expense",
    targetId: (result as { id?: string }).id ?? centerId,
    before: null,
    after: { ...data },
  });
  return result;
}

export async function adminUpdateExpense(
  actor: SessionUser,
  centerId: string,
  expenseId: string,
  data: Record<string, unknown>,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const before = await platformDb((tx) =>
    tx.expense.findUnique({
      where: { id: expenseId },
      select: { id: true, centerId: true, amount: true, category: true, description: true },
    }),
  );
  if (!before) throw new NotFoundError("Expense not found");
  requireCenterScope(acting, before.centerId);

  const result = await updateExpense(expenseId, data as never, acting);
  await audit(actor, centerId, {
    action: "center.expense_updated",
    targetType: "expense",
    targetId: expenseId,
    before,
    after: { changed: Object.keys(data), ...data },
  });
  return result;
}

export async function adminDeleteExpense(
  actor: SessionUser,
  centerId: string,
  expenseId: string,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const before = await platformDb((tx) =>
    tx.expense.findUnique({
      where: { id: expenseId },
      select: { id: true, centerId: true, amount: true, category: true, description: true },
    }),
  );
  if (!before) throw new NotFoundError("Expense not found");
  requireCenterScope(acting, before.centerId);

  const result = await deleteExpense(expenseId, acting);
  await audit(actor, centerId, {
    action: "center.expense_deleted",
    targetType: "expense",
    targetId: expenseId,
    before,
    after: { deleted: true, ledgerRowsAffected: 0 },
  });
  return result;
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
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const walletBefore = await platformDb((tx) =>
    tx.center.findUnique({ where: { id: centerId }, select: { walletBalance: true } }),
  );
  const result = await requestCenterPayout(acting, amount);
  await audit(actor, centerId, {
    action: "center.payout_requested",
    targetType: "payout",
    targetId: (result as { id?: string }).id ?? centerId,
    before: { walletBalance: walletBefore?.walletBalance ?? null },
    after: {
      amount: amount ?? null,
      status: "pending",
      moneyMoved: false,
      viaSanctionedFlow: "requestCenterPayout",
    },
  });
  return result;
}
