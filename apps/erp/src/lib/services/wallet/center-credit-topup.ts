import { platformDb, type TenantTx } from "@/lib/db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";
import { resolveDriver, onlineCheckoutAvailable } from "@/lib/services/payments/gateway";
import { creditMove } from "@repo/server-core/services/finance/center-credit";
import { nextTxnRef } from "@repo/server-core/services/finance/ref-numbers";
import type { SettleNotification } from "@repo/server-core/services/payments/notification-types";
import type { Prisma } from "@repo/database";

// ===========================================================================
// CENTER CREDIT TOP-UP (Phase 4, D4) — a center funds its credit_balance so
// the settlement debits (teacher shares + platform fees on center-collected
// money) land on a prepaid balance instead of accumulating as arrears.
//
// ONLINE ONLY, through the existing intent/webhook machinery — the same
// claim-in-one-transaction path every other purpose uses (M1), so a webhook
// replay can never credit twice. No second money engine, and deliberately NO
// back-office write path: money stays read-only in apps/superadmin.
// ===========================================================================

// The same local projection the sibling wallet services carry (deliberately
// duplicated there too — the shape is the client contract, not shared state).
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
  const driver = resolveDriver();
  // MVP blocker #2: a gateway checkout may only be OFFERED when it can settle
  // (see onlineCheckoutAvailable). Asserted at the initiator so no route can
  // mint a charge that is a dead end in production-with-mock.
  if (!onlineCheckoutAvailable()) {
    throw new BusinessRuleError("Online payments are not available yet");
  }

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

/** Settle a PAID center-credit top-up, within the webhook claim tx (M1). */
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

  // Money-in: center -> platform. No Payment row — a receipt names a person,
  // and this is a B2B position move; the Transaction and the ledger row are
  // its books (same posture as the parent wallet's float deposit).
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
    data: { transactionId: transaction.id },
  });

  return {
    studentId: intent.payerUserId ?? centerId,
    recipients: intent.payerUserId ? [intent.payerUserId] : [],
    type: "payment_recorded",
    title: "Center credit topped up",
    body: `${(intent.amount / 100).toFixed(2)} EGP was added to your center's platform credit.`,
    data: { amount: intent.amount, balanceAfter, refNumber },
  };
}

/** The center's credit position + its ledger — one read for the screen. */
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
