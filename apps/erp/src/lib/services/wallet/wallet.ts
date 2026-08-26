import { platformDb, type TenantTx } from "@/lib/db/scope";
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";
import type { Prisma } from "@repo/database";
import { notify } from "@/lib/services/notifications/notify";
import { studentAndParents } from "@/lib/services/notifications/fanout";
import { nextTxnRef } from "@/lib/services/finance/ref-numbers";
import { resolveDriver } from "@/lib/services/payments/gateway";
import type { SettleNotification } from "@/lib/services/payments/payment-intents";
import {
  walletCredit,
  getWalletSettings,
  assertTopupAllowed,
} from "@repo/server-core/services/wallet/wallet";

// Re-export the money primitives so callers can `@/lib/services/wallet/wallet`.
export {
  walletCredit,
  walletDebit,
  getWalletSettings,
  assertTopupAllowed,
  reconcileWallet,
  INSUFFICIENT_WALLET,
} from "@repo/server-core/services/wallet/wallet";

const INTENT_TTL_MS = 60 * 60 * 1000; // 1h checkout window

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
 * Create a wallet-top-up PaymentIntent. The requested amount is CLIENT-chosen
 * but SERVER-VALIDATED (min/max via assertTopupAllowed) and snapshotted onto
 * the intent — the webhook settles from the intent row, never from the gateway
 * payload. purpose=wallet_topup makes the webhook credit the wallet.
 */
export async function initiateWalletTopUpIntent(
  input: { amount: number; method: "card" | "wallet"; idempotencyKey: string },
  user: SessionUser,
) {
  if (user.role !== "student") throw new ForbiddenError("Students only");
  const driver = resolveDriver();

  const { intent, student } = await platformDb(
    async (tx) => {
      const existing = await tx.paymentIntent.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (existing.studentId !== user.id) {
          throw new ForbiddenError("Idempotency key belongs to another user");
        }
        return { intent: existing, student: null };
      }

      // Reject out-of-range amounts BEFORE creating the intent (no money taken).
      await assertTopupAllowed(tx, user.id, input.amount);

      const student = await tx.user.findUnique({
        where: { id: user.id },
        select: { id: true, name: true, email: true, phone: true },
      });
      const intent = await tx.paymentIntent.create({
        data: {
          studentId: user.id,
          purpose: "wallet_topup",
          amount: input.amount, // server-validated snapshot
          method: input.method,
          gateway: driver.name,
          idempotencyKey: input.idempotencyKey,
          expiresAt: new Date(Date.now() + INTENT_TTL_MS),
        },
      });
      return { intent, student };
    },
    { actorId: user.id },
  );

  if (!student) return toClientIntent(intent, null);

  const { gatewayOrderId, checkout } = await driver.createCheckout(intent, {
    id: student.id,
    name: student.name,
    email: student.email,
    phone: student.phone,
  });
  const updated = await platformDb((tx) =>
    tx.paymentIntent.update({ where: { id: intent.id }, data: { gatewayOrderId } }),
  );
  return toClientIntent(updated, checkout);
}

/**
 * Settle a paid wallet-top-up intent, WITHIN the webhook claim transaction (M1)
 * so credit is atomic with the pending->paid claim: Payment (platform receipt) +
 * Transaction (money-in, toEntityId NULL = platform float, not center revenue) +
 * wallet credit + ledger row. Idempotent via the intent claim — a replayed
 * webhook never reaches here (claim.count===0), so the wallet is credited ONCE.
 */
export async function settleWalletTopUpFromIntentTx(
  tx: TenantTx,
  intentId: string,
  opts: { gatewayRef: string | null },
): Promise<SettleNotification> {
  const intent = await tx.paymentIntent.findUnique({ where: { id: intentId } });
  if (!intent) throw new NotFoundError("Intent vanished during settlement");
  // studentId is nullable ONLY for purpose=parent_wallet_topup, which routes to
  // its own settler and never arrives here. Asserted rather than `!`-silenced,
  // so a future purpose that forgets its own settler fails loudly instead of
  // crediting nobody.
  const studentId = intent.studentId;
  if (!studentId) {
    throw new NotFoundError("Student top-up intent has no student to credit");
  }

  const receiptNumber = await nextPlatformReceipt(tx);
  const payment = await tx.payment.create({
    data: {
      centerId: null,
      studentId,
      courseId: null,
      amount: intent.amount,
      // MC-3: mirrors the sibling Transaction's method.
      paymentMethod: "online_paymob",
      note: `Wallet top-up (${intent.gateway}/${intent.method})`,
      receiptNumber,
      recordedBy: studentId, // self-service online top-up
      paidAt: new Date(),
    },
  });

  const refNumber = await nextTxnRef(tx);
  const transaction = await tx.transaction.create({
    data: {
      refNumber,
      type: "payment",
      amount: intent.amount,
      fromEntityId: studentId,
      toEntityId: null, // platform-held float — NOT center/teacher revenue
      centerId: null,
      status: "completed",
      paymentMethod: "online_paymob",
      gatewayRef: opts.gatewayRef,
      notes: `Wallet top-up (intent ${intent.id})`,
    },
  });

  const { balanceAfter } = await walletCredit(tx, studentId, intent.amount, {
    type: "topup",
    method: "online_paymob",
    refNumber,
    paymentId: payment.id,
    paymentIntentId: intent.id,
    relatedTxnId: transaction.id,
    reason: "Online wallet top-up",
  });

  await tx.paymentIntent.update({
    where: { id: intent.id },
    data: { paymentId: payment.id, transactionId: transaction.id },
  });

  return {
    studentId,
    type: "payment_recorded",
    title: "Wallet topped up",
    body: `${(intent.amount / 100).toFixed(2)} EGP was added to your wallet. Receipt ${receiptNumber}.`,
    data: {
      paymentId: payment.id,
      receiptNumber,
      amount: intent.amount,
      balanceAfter,
      studentId,
    },
  };
}

// ---------------------------------------------------------------------------
// Cash top-up at a center (recorded by center staff) — reuses the cash path.
// Center staff can only CREDIT; there is no center-facing wallet debit path.
// Runs under platformDb (the student_profiles wallet write is not reachable
// under a center RLS tenant); the center scope is enforced in-code (roster).
// ---------------------------------------------------------------------------

// The CASH top-up lives in the shared kernel (the back office runs it too);
// the online path above stays here because it needs the Paymob gateway.
export { topUpWalletCash } from "@repo/server-core/services/wallet/cash-topup";
// ---------------------------------------------------------------------------
// Reads (student's own wallet + history)
// ---------------------------------------------------------------------------

export async function getWalletForStudent(user: SessionUser) {
  if (user.role !== "student") throw new ForbiddenError("Students only");
  return platformDb(async (tx) => {
    const profile = await tx.studentProfile.findUnique({
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

export async function listWalletHistory(user: SessionUser, opts?: { limit?: number }) {
  if (user.role !== "student") throw new ForbiddenError("Students only");
  const limit = Math.min(200, Math.max(1, opts?.limit ?? 50));
  return platformDb(async (tx) => {
    const rows = await tx.walletLedger.findMany({
      where: { studentId: user.id },
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
        createdAt: true,
      },
    });
    return rows;
  });
}
