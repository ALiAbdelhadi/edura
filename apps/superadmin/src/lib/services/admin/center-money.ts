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

// ---------------------------------------------------------------------------
// PHASE 4 — MONEY, THE SANCTIONED FLOWS ONLY.
//
// Read this before adding anything here.
//
// Every operation in this file is a flow the product already has: recording a
// cash payment against a receipt, taking a cash wallet top-up, selling a
// walk-in subscription, booking an expense, requesting a payout. Each one
// writes through the money engine, in one transaction, with a receipt or a
// reference number and the REAL actor recorded.
//
// What is NOT here, and must never be:
//   • no UPDATE or DELETE of a `transactions`, `points_ledger`,
//     `wallet_ledger` or `session_settlements` row — the DB REVOKEs refuse it
//     for the application role, super admin included;
//   • no direct write to `centers.wallet_balance` or
//     `student_profiles.wallet_balance` — balances move only as a consequence
//     of a ledger entry;
//   • no wallet DEBIT or withdrawal on a student's behalf. The counter can put
//     cash IN; only the student's own spending or a refund takes it out.
//
// On "refund": the center-side transition (paid → refunded) is a STATUS FLAG on
// the Payment row. It does NOT write a reversal to the ledger. The real refund,
// which does, is the accountant's `refundLessonForStudent` (H3 — one refund per
// payment, enforced by a partial unique). `adminMarkPaymentRefunded` below is
// therefore named for what it is, and says so, so nobody reaches for it
// expecting money to move.
// ---------------------------------------------------------------------------

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

// ===========================================================================
// Payments
// ===========================================================================

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

/**
 * Record a cash payment taken at the counter. Writes Payment + Transaction in
 * one go, with a center receipt number and `recordedBy` = the super admin.
 */
export async function adminRecordPayment(
  actor: SessionUser,
  centerId: string,
  data: { studentId: string; courseId?: string; amount: number; note?: string },
) {
  if (data.amount <= 0) {
    // A negative amount is how the underlying service expresses a refund. That
    // path is NOT opened here — refunds have their own flow with its own
    // one-refund-per-payment guard.
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

/**
 * Flip a payment's STATUS to refunded (paid → refunded).
 *
 * This is the center's own transition and it is a bookkeeping flag: it writes
 * NO reversal to the ledger and moves no balance. Returning money is
 * `refundLessonForStudent` in the finance surface, which writes the reversal
 * and is guarded to one refund per payment (H3).
 */
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
      // Said plainly in the record, because this is the easiest thing in the
      // whole system to misread.
      ledgerReversalWritten: false,
      moneyReturned: false,
      note: "Status flag only — use the finance refund flow to return money",
    },
  });
  return result.updated;
}

// ===========================================================================
// Wallet top-up (credit only)
// ===========================================================================

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
      // Credit only — there is no counter-side debit anywhere in the product.
      direction: "credit",
      viaSanctionedFlow: "topUpWalletCash",
    },
  });
  return result;
}

// ===========================================================================
// Walk-in subscription
// ===========================================================================

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
      // The price is the server-side snapshot of the course's plan price — no
      // amount is accepted from the caller.
      price: (sub as { price?: number }).price ?? null,
      method: "cash",
      viaSanctionedFlow: "createWalkInSubscription",
    },
  });
  return result;
}

// ===========================================================================
// Expenses
// ===========================================================================

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
    // Expenses are the center's own bookkeeping, NOT the append-only ledger —
    // they carry no REVOKE and deleting one reverses nothing in `transactions`.
    after: { deleted: true, ledgerRowsAffected: 0 },
  });
  return result;
}

// ===========================================================================
// Center wallet + payouts
// ===========================================================================

export async function adminGetCenterWallet(actor: SessionUser, centerId: string) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return getCenterWallet(acting);
}

export async function adminListCenterPayouts(actor: SessionUser, centerId: string) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return listCenterPayouts(acting);
}

/**
 * Raise a payout REQUEST on the center's behalf. It creates a pending payout —
 * it does not pay anything. Approval and settlement stay in the accountant's
 * finance surface, where the H1 row lock and the H2 balance floor live.
 */
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
      // Requesting moves nothing. Approval + settlement are the accountant's,
      // and that is where the H1 lock and H2 floor apply.
      moneyMoved: false,
      viaSanctionedFlow: "requestCenterPayout",
    },
  });
  return result;
}
