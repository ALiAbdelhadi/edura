import { platformDb, type TenantTx } from "@/lib/db/scope";
import { ForbiddenError, NotFoundError } from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";
import type { Prisma } from "@repo/database";
import { nextTxnRef } from "@/lib/services/finance/ref-numbers";
import { resolveDriver } from "@/lib/services/payments/gateway";
import type { SettleNotification } from "@/lib/services/payments/payment-intents";
import {
  getWalletSettings,
  assertTopupAllowed,
} from "@repo/server-core/services/wallet/wallet";
import { parentWalletCredit } from "@repo/server-core/services/wallet/parent-wallet";

// Re-export the money primitives so callers can `@/lib/services/wallet/parent-wallet`.
export {
  parentWalletCredit,
  parentWalletDebit,
  reconcileParentWallet,
  assertApprovedChild,
  approvedChildIds,
  INSUFFICIENT_PARENT_WALLET,
} from "@repo/server-core/services/wallet/parent-wallet";

const INTENT_TTL_MS = 60 * 60 * 1000; // 1h checkout window — same as every other intent

async function nextPlatformReceipt(tx: TenantTx): Promise<string> {
  const rows = await tx.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('platform_receipt_seq'::regclass)`;
  return `RCP-EDURA-${new Date().getFullYear()}-${String(Number(rows[0].nextval)).padStart(5, "0")}`;
}

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

// ---------------------------------------------------------------------------
// Online top-up (Paymob / mock) — reuses the Step 3 intent + webhook engine
// ---------------------------------------------------------------------------

/**
 * Create a PARENT wallet-top-up PaymentIntent. Same machinery as the student
 * top-up, with two differences that the schema now records explicitly:
 *
 *   studentId   = NULL — this money has no beneficiary student yet; it is
 *                 platform float until the parent spends it on a specific
 *                 child. A DB CHECK holds that NULL to this one purpose.
 *   payerUserId = the parent — who is actually paying.
 *
 * The amount is CLIENT-chosen but SERVER-VALIDATED (the same min/max policy as
 * the student wallet) and snapshotted onto the intent; the webhook settles from
 * the intent row, never from the gateway payload.
 */
export async function initiateParentWalletTopUpIntent(
  input: { amount: number; method: "card" | "wallet"; idempotencyKey: string },
  user: SessionUser,
) {
  if (user.role !== "parent") throw new ForbiddenError("Parents only");
  const driver = resolveDriver();

  const { intent, parent } = await platformDb(
    async (tx) => {
      const existing = await tx.paymentIntent.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        // The principal of a parent top-up is the PAYER, not a student.
        if (existing.payerUserId !== user.id) {
          throw new ForbiddenError("Idempotency key belongs to another user");
        }
        return { intent: existing, parent: null };
      }

      // Reject out-of-range amounts BEFORE creating the intent (no money taken).
      await assertTopupAllowed(tx, user.id, input.amount);

      // A parent who somehow has no profile row cannot hold a balance — fail
      // here rather than at settlement, when the money would already be taken.
      const profile = await tx.parentProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!profile) throw new NotFoundError("Parent profile not found");

      const parent = await tx.user.findUnique({
        where: { id: user.id },
        select: { id: true, name: true, email: true, phone: true },
      });
      const intent = await tx.paymentIntent.create({
        data: {
          studentId: null, // no beneficiary — see the doc comment above
          payerUserId: user.id,
          purpose: "parent_wallet_topup",
          amount: input.amount, // server-validated snapshot
          method: input.method,
          gateway: driver.name,
          idempotencyKey: input.idempotencyKey,
          expiresAt: new Date(Date.now() + INTENT_TTL_MS),
        },
      });
      return { intent, parent };
    },
    { actorId: user.id },
  );

  if (!parent) return toClientIntent(intent, null);

  // Billing contact is the PARENT — it is their card at the gateway.
  const { gatewayOrderId, checkout } = await driver.createCheckout(intent, {
    id: parent.id,
    name: parent.name,
    email: parent.email,
    phone: parent.phone,
  });
  const updated = await platformDb((tx) =>
    tx.paymentIntent.update({ where: { id: intent.id }, data: { gatewayOrderId } }),
  );
  return toClientIntent(updated, checkout);
}

/**
 * Settle a paid PARENT top-up intent, WITHIN the webhook claim transaction (M1)
 * so the credit is atomic with the pending->paid claim.
 *
 * Deliberately writes NO Payment row: a Payment is a receipt for money a
 * student owes a center or teacher, and this is neither — it is a float deposit
 * by a guardian. Its receipt number lives on the Transaction and on the ledger
 * row's refNumber, which is what the parent's wallet history displays. That is
 * also why payments.student_id stayed NOT NULL.
 *
 * Idempotent via the intent claim — a replayed webhook never reaches here
 * (claim.count===0), so the wallet is credited ONCE.
 */
export async function settleParentWalletTopUpFromIntentTx(
  tx: TenantTx,
  intentId: string,
  opts: { gatewayRef: string | null },
): Promise<SettleNotification> {
  const intent = await tx.paymentIntent.findUnique({ where: { id: intentId } });
  if (!intent) throw new NotFoundError("Intent vanished during settlement");
  if (!intent.payerUserId) {
    // Cannot happen (initiate always sets it); guards against a hand-written row
    // silently crediting nobody.
    throw new NotFoundError("Parent top-up intent has no payer");
  }
  const parentId = intent.payerUserId;

  const receiptNumber = await nextPlatformReceipt(tx);
  const refNumber = await nextTxnRef(tx);
  const transaction = await tx.transaction.create({
    data: {
      refNumber,
      type: "payment",
      amount: intent.amount,
      fromEntityId: parentId,
      toEntityId: null, // platform-held float — NOT center/teacher revenue
      centerId: null,
      status: "completed",
      paymentMethod: "online_paymob",
      gatewayRef: opts.gatewayRef,
      notes: `Parent wallet top-up (intent ${intent.id}, receipt ${receiptNumber})`,
    },
  });

  const { balanceAfter } = await parentWalletCredit(tx, parentId, intent.amount, {
    type: "topup",
    method: "online_paymob",
    refNumber,
    paymentIntentId: intent.id,
    relatedTxnId: transaction.id,
    reason: "Online wallet top-up",
    recordedBy: parentId, // self-service
  });

  await tx.paymentIntent.update({
    where: { id: intent.id },
    data: { transactionId: transaction.id },
  });

  return {
    // Addressed to the PARENT alone — the default studentAndParents() fan-out
    // is meaningless here, since no child is involved in a top-up.
    studentId: parentId,
    recipients: [parentId],
    type: "payment_recorded",
    title: "Wallet topped up",
    body: `${(intent.amount / 100).toFixed(2)} EGP was added to your wallet. Receipt ${receiptNumber}.`,
    data: {
      receiptNumber,
      amount: intent.amount,
      balanceAfter,
      parentId,
    },
  };
}

// ---------------------------------------------------------------------------
// Reads (the parent's own wallet + history)
// ---------------------------------------------------------------------------

export async function getWalletForParent(user: SessionUser) {
  if (user.role !== "parent") throw new ForbiddenError("Parents only");
  return platformDb(async (tx) => {
    const profile = await tx.parentProfile.findUnique({
      where: { userId: user.id },
      select: { walletBalance: true },
    });
    const settings = await getWalletSettings(tx);
    return {
      balance: profile?.walletBalance ?? 0,
      currency: "EGP",
      minTopup: settings.minTopup,
      maxTopup: settings.maxTopup,
    };
  });
}

export async function listParentWalletHistory(
  user: SessionUser,
  opts?: { limit?: number },
) {
  if (user.role !== "parent") throw new ForbiddenError("Parents only");
  const limit = Math.min(200, Math.max(1, opts?.limit ?? 50));
  return platformDb(async (tx) => {
    const rows = await tx.parentWalletLedger.findMany({
      where: { parentId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        type: true,
        delta: true,
        balanceAfter: true,
        method: true,
        refNumber: true,
        reason: true,
        beneficiaryStudentId: true,
        createdAt: true,
      },
    });

    // Name the child a spend was for — a bare uuid is useless in a history list.
    const childIds = [
      ...new Set(rows.map((r) => r.beneficiaryStudentId).filter(Boolean) as string[]),
    ];
    const children = childIds.length
      ? await tx.user.findMany({
          where: { id: { in: childIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(children.map((c) => [c.id, c.name]));

    return rows.map((r) => ({
      ...r,
      beneficiaryName: r.beneficiaryStudentId
        ? (nameById.get(r.beneficiaryStudentId) ?? null)
        : null,
    }));
  });
}
