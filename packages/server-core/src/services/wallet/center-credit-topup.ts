import { platformDb, type TenantTx } from "../../db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { resolveDriver, onlineCheckoutAvailable } from "../payments/gateway";
import { creditMove } from "../finance/center-credit";
import { nextTxnRef } from "../finance/ref-numbers";
import { nextPlatformReceipt } from "./wallet-facade";
import type { SettleNotification } from "../payments/notification-types";
import type { Prisma } from "@repo/database";

function toClientIntent(
  intent: Prisma.PaymentIntentGetPayload<Record<string, never>>,
  checkout: { kind: string; url: string } | null,
) {
  return {
    id: intent.id,
    purpose: intent.purpose,
    amount: intent.amount,
    currency: intent.currency,
    method: intent.method,
    gateway: intent.gateway,
    status: intent.status,
    failureReason: intent.failureReason,
    expiresAt: intent.expiresAt,
    paidAt: intent.paidAt,
    createdAt: intent.createdAt,
    checkout,
  };
}

const INTENT_TTL_MS = 30 * 60 * 1000;
const MIN_TOPUP = 1_000; // 10 EGP
const MAX_TOPUP = 5_000_000; // 50,000 EGP

export async function initiateCenterCreditTopUp(
  input: { amount: number; method: "card" | "wallet"; idempotencyKey: string },
  user: SessionUser,
) {
  if (user.role !== "center_admin" || !user.centerId) {
    throw new ForbiddenError("Center owners only");
  }
  if (!Number.isInteger(input.amount) || input.amount < MIN_TOPUP || input.amount > MAX_TOPUP) {
    throw new BusinessRuleError(
      `Top-up must be between ${MIN_TOPUP / 100} and ${MAX_TOPUP / 100} EGP`,
    );
  }
  // Availability first: in production with PAYMENTS_MODE=mock the driver
  // refuses to exist (M-07), and the caller deserves the 422 not the throw.
  if (!onlineCheckoutAvailable()) {
    throw new BusinessRuleError("Online payments are not available yet");
  }
  const driver = resolveDriver();

  const { intent, payer } = await platformDb(
    async (tx) => {
      const existing = await tx.paymentIntent.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (existing.centerId !== user.centerId || existing.payerUserId !== user.id) {
          throw new ForbiddenError("Idempotency key belongs to another payer");
        }
        return { intent: existing, payer: null };
      }
      const payer = await tx.user.findUnique({
        where: { id: user.id },
        select: { id: true, name: true, email: true, phone: true },
      });
      const intent = await tx.paymentIntent.create({
        data: {
          studentId: null, // no beneficiary student — the guarded studentless purpose
          payerUserId: user.id,
          purpose: "center_credit_topup",
          centerId: user.centerId,
          amount: input.amount,
          method: input.method,
          gateway: driver.name,
          idempotencyKey: input.idempotencyKey,
          expiresAt: new Date(Date.now() + INTENT_TTL_MS),
        },
      });
      return { intent, payer };
    },
    { actorId: user.id },
  );

  if (!payer) return toClientIntent(intent, null);

  const { gatewayOrderId, checkout } = await driver.createCheckout(intent, {
    id: payer.id,
    name: payer.name,
    email: payer.email,
    phone: payer.phone,
  });
  const updated = await platformDb((tx) =>
    tx.paymentIntent.update({ where: { id: intent.id }, data: { gatewayOrderId } }),
  );
  return toClientIntent(updated, checkout);
}

export async function settleCenterCreditTopUpFromIntentTx(
  tx: TenantTx,
  intentId: string,
  opts: { gatewayRef: string | null },
): Promise<SettleNotification> {
  const intent = await tx.paymentIntent.findUnique({ where: { id: intentId } });
  if (!intent) throw new NotFoundError("Intent vanished during settlement");
  const centerId = intent.centerId;
  if (!centerId || intent.purpose !== "center_credit_topup") {
    throw new BusinessRuleError("Not a center credit top-up intent");
  }
  const payerUserId = intent.payerUserId;
  if (!payerUserId) throw new BusinessRuleError("Center credit top-up intent has no payer");

  // SECURITY_AUDIT.md (2026-09-11) BIZ-02. H-03 rule 2 says an intent is never
  // `paid` without a `payments` row, and the claim path enforces it by
  // re-reading `paymentId` after settlement and throwing when it is null.
  // This settler linked only the Transaction, so every real capture of a
  // centre credit top-up rolled back and retried forever — money taken,
  // nothing credited. The receipt is the same shape as an online wallet
  // top-up: platform-held, no student, no centre on the row (the
  // `payments_student_required` CHECK is what allows a studentless receipt,
  // and only in exactly that shape), the payer is the centre owner.
  const receiptNumber = await nextPlatformReceipt(tx);
  const payment = await tx.payment.create({
    data: {
      centerId: null,
      studentId: null,
      payerUserId,
      courseId: null,
      amount: intent.amount,
      paymentMethod: "online_paymob",
      note: `Center credit top-up for center ${centerId} (${intent.gateway}/${intent.method})`,
      receiptNumber,
      recordedBy: payerUserId,
      paidAt: new Date(),
    },
  });

  const refNumber = await nextTxnRef(tx);
  const transaction = await tx.transaction.create({
    data: {
      refNumber,
      type: "payment",
      amount: intent.amount,
      fromEntityId: centerId,
      toEntityId: null, // platform-held
      centerId,
      status: "completed",
      paymentMethod: "online_paymob",
      funding: "platform_held",
      gatewayRef: opts.gatewayRef,
      notes: `Center credit top-up (intent ${intent.id})`,
    },
  });

  const { balanceAfter } = await creditMove(tx, {
    centerId,
    type: "topup",
    delta: intent.amount,
    method: "online_paymob",
    refNumber,
    paymentIntentId: intent.id,
    relatedTxnId: transaction.id,
    recordedBy: intent.payerUserId,
    reason: "Online center credit top-up",
  });

  await tx.paymentIntent.update({
    where: { id: intent.id },
    data: { paymentId: payment.id, transactionId: transaction.id },
  });

  return {
    studentId: payerUserId,
    recipients: [payerUserId],
    type: "payment_recorded",
    title: "Center credit topped up",
    body: `${(intent.amount / 100).toFixed(2)} EGP was added to your center's platform credit.`,
    // No `receiptNumber` key on purpose: the claim path mails a STUDENT receipt
    // for any notification carrying one, and this receipt names no student.
    data: { amount: intent.amount, balanceAfter, refNumber, paymentId: payment.id },
  };
}

export async function getCenterCredit(user: SessionUser, opts?: { take?: number }) {
  if (user.role !== "center_admin" || !user.centerId) throw new ForbiddenError();
  const centerId = user.centerId;
  const take = Math.min(100, Math.max(1, opts?.take ?? 50));
  return platformDb(async (tx) => {
    const center = await tx.center.findUnique({
      where: { id: centerId },
      select: { creditBalance: true },
    });
    if (!center) throw new NotFoundError("Center not found");
    const entries = await tx.centerWalletLedger.findMany({
      where: { centerId },
      orderBy: { createdAt: "desc" },
      take,
    });
    return { creditBalance: center.creditBalance, entries };
  });
}
