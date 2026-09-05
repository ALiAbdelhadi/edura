import { scopedDb, type TenantTx } from "../../db/scope";
import { runEffects } from "../../db/effects";
import { notify } from "../../services/notifications/notify";
import { studentAndParents } from "../../services/notifications/fanout";
import { nextTxnRef } from "../../services/finance/ref-numbers";
import { openShiftIdFor } from "../center/shifts";
import { fundingOfMethod } from "../finance/center-credit";
import { BusinessRuleError, NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { nextReceiptNumber } from "./receipt-sequence";

/**
 * How the money goes back. `wallet` is deliberately NOT offered by the counter:
 * WALLET_SPENDABILITY.md proved a student wallet credit is a trapped balance —
 * nothing user-reachable spends it and the counter cannot take it back — so
 * offering it would be recording a refund the family cannot use.
 */
export const COUNTER_REFUND_CHANNELS = ["cash_drawer", "bank_transfer", "gateway"] as const;
export type CounterRefundChannel = (typeof COUNTER_REFUND_CHANNELS)[number];

export type RefundPaymentInput = {
  /** The receipt being reversed. */
  paymentId: string;
  /** POSITIVE piasters to hand back. The sign lives in the row this writes. */
  amount: number;
  reason: string;
  /** Where the money goes. Required — the DB refuses a reversing row without it. */
  refundChannel: CounterRefundChannel;
  /** Retry key. A repeat of the same key resolves to a 422, never a second refund. */
  clientRequestId?: string;
};

/**
 * The single refund door (REFUND_DECISION.md §2.0).
 *
 * Before this, a refund was `recordPayment({ amount: -X })` — a negative row
 * with no link to what it reversed, no idempotency key, and a bound that lived
 * first in the browser and then in a service-side stopgap. `recordPaymentTx`
 * now refuses negatives outright, which is the refusal `adminRecordCenterPayment`
 * has always made, so both apps finally agree on what a refund is.
 *
 * The money leg is **Option B**: the cash leaves the drawer, or the gateway
 * reverses the charge, and the platform records an outflow it did not itself
 * execute. So a refund is armed as an OBLIGATION — a `payments` row carrying
 * its channel and no confirmation, and a `transactions` row written `pending` —
 * and only `confirmRefund` turns it into a settled movement. Option A was
 * rejected on the evidence in WALLET_SPENDABILITY.md: a student-wallet credit
 * is a balance nothing user-reachable can spend and nothing converts to cash.
 *
 * What is DELIBERATELY not here:
 *   - **Teacher wallets and platform commission.** ERP may not reach platform
 *     money. A receipt whose lessons have already settled is REFUSED here and
 *     belongs to `refundLessonForStudent`, which runs on `platformDb`.
 *   - **The roster.** A refund is a coverage event. `CLAUDE.md` decision #2:
 *     the subscription is the payment coverage, the enrollment is the roster
 *     link. Cancelling coverage is what stops the overpayment; the seat stays.
 */
export async function refundPayment(input: RefundPaymentInput, user: SessionUser) {
  const { value, effects } = await scopedDb(user, (tx) => refundPaymentTx(tx, input, user));
  await runEffects(effects);
  return value;
}

/**
 * Every session a payment's subscriptions cover. A per-session pass covers the
 * one session it names; a monthly plan covers its course's sessions inside the
 * paid period — the same two shapes `coveredStudentIds` matches on, kept in
 * step with it deliberately.
 */
async function coveredSessionIds(
  tx: TenantTx,
  subs: { plan: string; sessionId: string | null; courseId: string; periodStart: Date | null; periodEnd: Date | null }[],
): Promise<string[]> {
  const ids = new Set<string>();
  for (const sub of subs) {
    if (sub.plan === "per_session") {
      if (sub.sessionId) ids.add(sub.sessionId);
      continue;
    }
    if (!sub.periodStart || !sub.periodEnd) continue;
    const sessions = await tx.session.findMany({
      where: {
        courseId: sub.courseId,
        date: { gte: sub.periodStart, lte: sub.periodEnd },
      },
      select: { id: true },
    });
    for (const s of sessions) ids.add(s.id);
  }
  return [...ids];
}


/**
 * `payments_one_refund_per_payment` (one refund per receipt) and
 * `payments_client_request_unique` (a retry after the 45s money-write timeout)
 * are BOTH unique indexes, and both mean the same thing to the operator: this
 * receipt has already been refunded. A P2002 here is a domain outcome, not a
 * server fault, so it leaves as a 422 rather than a 500.
 */
async function createRefundRow(
  tx: TenantTx,
  data: Parameters<TenantTx["payment"]["create"]>[0]["data"],
) {
  try {
    return await tx.payment.create({ data });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw new BusinessRuleError("This receipt has already been refunded");
    }
    throw err;
  }
}

export async function refundPaymentTx(
  tx: TenantTx,
  input: RefundPaymentInput,
  user: SessionUser,
) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new BusinessRuleError("Amount must be a positive whole number of piasters");
  }
  if (!input.reason.trim()) throw new BusinessRuleError("A refund reason is required");

  const original = await tx.payment.findFirst({
    where: { id: input.paymentId, centerId: user.centerId },
  });
  if (!original) throw new NotFoundError("Original payment not found");
  if (original.amount <= 0 || original.reversalOfId !== null) {
    throw new BusinessRuleError("A refund cannot reverse another refund");
  }
  if (!original.studentId) throw new BusinessRuleError("This receipt names no student");
  const studentId = original.studentId;

  // ---- The settled-lesson gate (REFUND_DECISION.md §1.4, §2.0 step 2) -------
  //
  // A refund used to leave the subscription active, so `coveredStudentIds` kept
  // returning the student and `distribution.ts` kept paying teacher and centre
  // at every later lesson — a continuing overpayment funded by money that had
  // been given back.
  //
  // Cancelling coverage below stops the FUTURE lessons. This gate handles the
  // PAST ones: if money has already been distributed for this student under
  // this receipt, it now sits in a teacher's or a centre's wallet, and clawing
  // it back is `refundLessonForStudent`'s job — it runs on `platformDb`, may
  // reach those wallets, and already returns H-9's clean 422 when a wallet
  // cannot cover the clawback. ERP may not, so ERP refuses.
  //
  // The check is per-STUDENT, not per-session: `distribution.ts` writes one
  // `type:"payment"` row per attending student with `fromEntityId = studentId`
  // and `lessonId = sessionId`, so a settled lesson this student did not attend
  // moved no money of theirs and must not block their refund.
  // (`session_settlements` cannot answer this — it is `sessionId @unique`.)
  const subs = await tx.subscription.findMany({
    where: { paymentId: original.id },
    select: {
      id: true, plan: true, sessionId: true, courseId: true,
      periodStart: true, periodEnd: true, status: true,
    },
  });
  const sessionIds = await coveredSessionIds(tx, subs);
  if (sessionIds.length > 0) {
    const settled = await tx.transaction.findFirst({
      where: {
        type: "payment",
        status: "completed",
        fromEntityId: studentId,
        lessonId: { in: sessionIds },
      },
      select: { id: true },
    });
    if (settled) {
      throw new BusinessRuleError(
        "A lesson under this receipt has already been settled — refund the lesson instead",
      );
    }
  }

  // ---- The bound, in the database (§2.0 step 3) ----------------------------
  //
  // `refunded_total <= amount - X` is `refunded_total + X <= amount`. Zero rows
  // affected is a clean 422, never a 500, and the
  // `payments_refunded_within_amount` CHECK is what makes it impossible to get
  // past this by any other route. This REPLACES the service-side stopgap —
  // a bound in code and a bound in the database that can disagree is worse than
  // either alone.
  const bumped = await tx.payment.updateMany({
    where: { id: original.id, refundedTotal: { lte: original.amount - input.amount } },
    data: { refundedTotal: { increment: input.amount } },
  });
  if (bumped.count === 0) throw new BusinessRuleError("Refund exceeds the original payment");
  const isFullRefund = original.refundedTotal + input.amount === original.amount;

  // A refund of PLATFORM-held money never came out of this centre's drawer, so
  // it must not enter the till: inheriting the method keeps it out of the cash
  // bucket `cashNetOf` reads, and no shift stamp keeps it out entirely.
  const funding = fundingOfMethod(original.paymentMethod);
  const platformHeld = funding === "platform_held";

  const receiptNumber = await nextReceiptNumber(tx, user.centerId as string);
  const refund = await createRefundRow(tx, {
    centerId: user.centerId as string,
    studentId,
    payerUserId: original.payerUserId,
    // Inherited, so the refund lands on the same class the charge did. It
    // used to be null, which left every refund unattributed to any class.
    courseId: original.courseId,
    amount: -input.amount,
    paymentMethod: original.paymentMethod,
    // Just the reason. The link to the original used to live in this free
    // text because there was no column for it; `reversal_of_id` is that
    // column, so the note goes back to being the operator's own words.
    note: input.reason.trim(),
    receiptNumber,
    reversalOfId: original.id,
    refundChannel: input.refundChannel,
    clientRequestId: input.clientRequestId ?? null,
    recordedBy: user.id,
    shiftId: platformHeld ? null : await openShiftIdFor(tx, user.id),
    paidAt: new Date(),
  });

  // The charge's own ledger row, so the refund can reverse it. NULL for rows
  // written before migration 20260906120000 — `transactions` has UPDATE revoked
  // so they cannot be backfilled, and a missing link must not refuse a refund.
  const chargeTxn = await tx.transaction.findFirst({
    where: { paymentId: original.id, type: "payment" },
    select: { id: true },
  });
  const refNumber = await nextTxnRef(tx);
  await tx.transaction.create({
    data: {
      refNumber,
      type: "refund",
      amount: input.amount,
      fromEntityId: user.centerId as string,
      toEntityId: studentId,
      centerId: user.centerId as string,
      paymentId: refund.id,
      reversalOfId: chargeTxn?.id ?? null,
      // PENDING, not completed: at this moment the platform has promised the
      // money back, not handed it over. `confirmRefund` appends the evidence.
      // This is also what finally makes the superadmin decision-queue tile
      // (type:"refund", status:"pending") a live count instead of a permanent
      // zero — it was dead because every writer set "completed".
      status: "pending",
      paymentMethod: original.paymentMethod,
      funding,
      notes: `Refund via ${input.refundChannel} at center (receipt ${receiptNumber}, reversing ${original.receiptNumber}) — awaiting confirmation`,
    },
  });

  // ---- The coverage coupling (§2.0 step 7) ---------------------------------
  // Only a FULL refund ends coverage: a partial refund is a correction, not a
  // withdrawal. The enrollment is untouched by design — see the header.
  const cancelledSubscriptionIds: string[] = [];
  if (isFullRefund) {
    for (const sub of subs) {
      if (sub.status !== "active" && sub.status !== "pending_payment") continue;
      await tx.subscription.update({
        where: { id: sub.id },
        data: { status: "cancelled", cancelledAt: new Date() },
      });
      cancelledSubscriptionIds.push(sub.id);
    }
  }

  await tx.auditLog.create({
    data: {
      actorId: user.id,
      action: "payment.refund_initiated",
      targetType: "payment",
      targetId: original.id,
      centerId: user.centerId,
      // The route is `center_admin`-only, so there is no delegated actor to
      // record. If it ever accepts centre staff, `centerActor()` is what
      // supplies this — the same shape the attendance and notes surfaces use.
      onBehalfOf: null,
      beforeState: {
        amount: original.amount,
        refundedTotal: original.refundedTotal,
        receiptNumber: original.receiptNumber,
      },
      afterState: {
        refundAmount: input.amount,
        refundedTotal: original.refundedTotal + input.amount,
        refundPaymentId: refund.id,
        refundReceiptNumber: receiptNumber,
        reason: input.reason.trim(),
        refundChannel: input.refundChannel,
        full: isFullRefund,
        cancelledSubscriptionIds,
      },
    },
  });

  return {
    value: { ...refund, isFullRefund, cancelledSubscriptionIds },
    effects: [
      async () => {
        await notify({
          recipients: await studentAndParents(studentId),
          type: "payment_recorded",
          title: "Refund recorded",
          body: `Receipt ${receiptNumber} has been issued.`,
          data: {
            paymentId: refund.id,
            receiptNumber,
            amount: -input.amount,
            studentId,
            reversalOf: original.receiptNumber,
          },
        });
      },
    ],
  };
}

export type ConfirmRefundInput = {
  /** The refund row (the negative one), not the receipt it reverses. */
  refundPaymentId: string;
  /** The evidence: signed voucher number, bank reference, or provider refund id. */
  externalRef: string;
};

/**
 * Phase 2 — the money actually reached the family, and here is the proof.
 *
 * Why this appends instead of flipping a status: `transactions` has UPDATE
 * revoked from `edura_app` (migration `00000000000003`), so the `pending` row
 * written at phase 1 can NEVER become `completed`. That is a constraint, and it
 * is also the point — the evidence trail is immutable by construction. The
 * confirmation is a second, append-only `adjustment` row carrying the
 * reference, with the pending row left standing beside it.
 *
 * Which means: **`transactions.status` cannot answer "was this refund paid?"**
 * `payments.refund_confirmed_at` is the state; the ledger rows are the trail.
 * Every reader keys off the payment — see `refundsReport` and the accountant
 * dashboard, both corrected alongside this.
 *
 * `gateway` is refused here on purpose. A provider reversal is confirmed by the
 * webhook, which verifies its HMAC with `timingSafeEqual` (C1), and never by a
 * human typing a reference. `payments_refund_external_ref_unique` is the
 * backstop that stops one provider reference confirming two refunds.
 */
export async function confirmRefund(input: ConfirmRefundInput, user: SessionUser) {
  const { value, effects } = await scopedDb(user, async (tx) => {
    const ref = input.externalRef.trim();
    if (!ref) throw new BusinessRuleError("A reference is required to confirm a refund");

    const refund = await tx.payment.findFirst({
      where: { id: input.refundPaymentId, centerId: user.centerId },
    });
    if (!refund) throw new NotFoundError("Refund not found");
    if (refund.reversalOfId === null || refund.amount >= 0) {
      throw new BusinessRuleError("This receipt is not a refund");
    }
    if (refund.refundChannel === "gateway") {
      throw new BusinessRuleError(
        "A gateway refund is confirmed by the provider, not by hand",
      );
    }
    if (refund.refundConfirmedAt !== null) {
      throw new BusinessRuleError("This refund is already confirmed");
    }

    // Conditional on still being unconfirmed, so two staff pressing confirm
    // resolve to one row and one adjustment, not two. Zero rows is a 422.
    const claimed = await tx.payment.updateMany({
      where: { id: refund.id, refundConfirmedAt: null },
      data: {
        refundExternalRef: ref,
        refundConfirmedAt: new Date(),
        refundConfirmedBy: user.id,
      },
    });
    if (claimed.count === 0) throw new BusinessRuleError("This refund is already confirmed");

    const refNumber = await nextTxnRef(tx);
    await tx.transaction.create({
      data: {
        refNumber,
        type: "adjustment",
        amount: Math.abs(refund.amount),
        fromEntityId: user.centerId as string,
        toEntityId: refund.studentId,
        centerId: user.centerId as string,
        paymentId: refund.id,
        status: "completed",
        paymentMethod: refund.paymentMethod,
        funding: fundingOfMethod(refund.paymentMethod),
        notes: `Refund confirmed via ${refund.refundChannel} (receipt ${refund.receiptNumber}, ref ${ref})`,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "payment.refund_confirmed",
        targetType: "payment",
        targetId: refund.id,
        centerId: user.centerId,
        beforeState: { confirmedAt: null, externalRef: null },
        afterState: {
          receiptNumber: refund.receiptNumber,
          refundChannel: refund.refundChannel,
          externalRef: ref,
          amount: Math.abs(refund.amount),
        },
      },
    });

    const confirmed = await tx.payment.findUniqueOrThrow({ where: { id: refund.id } });
    return {
      value: confirmed,
      effects: [
        async () => {
          if (!confirmed.studentId) return;
          await notify({
            recipients: await studentAndParents(confirmed.studentId),
            type: "payment_recorded",
            title: "Refund confirmed",
            body: `Receipt ${confirmed.receiptNumber} has been paid out.`,
            data: {
              paymentId: confirmed.id,
              receiptNumber: confirmed.receiptNumber,
              amount: confirmed.amount,
              studentId: confirmed.studentId,
            },
          });
        },
      ],
    };
  });
  await runEffects(effects);
  return value;
}

/**
 * Refunds this centre has armed but not yet paid out. The queue an operator
 * works, and the thing a shift's unexplained variance should be checked against.
 */
export async function listUnconfirmedRefunds(user: SessionUser) {
  return scopedDb(user, (tx) =>
    tx.payment.findMany({
      where: {
        centerId: user.centerId,
        reversalOfId: { not: null },
        refundConfirmedAt: null,
      },
      orderBy: { paidAt: "desc" },
      take: 100,
    }),
  );
}
