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
import { resolveDriver, onlineCheckoutAvailable } from "@/lib/services/payments/gateway";
import type { SettleNotification } from "@/lib/services/payments/payment-intents";
import {
  walletCredit,
  getWalletSettings,
  assertTopupAllowed,
} from "@repo/server-core/services/wallet/wallet";
import { assertApprovedChild } from "@repo/server-core/services/wallet/parent-wallet";

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

export async function initiateWalletTopUpIntent(
  input: { amount: number; method: "card" | "wallet"; idempotencyKey: string },
  user: SessionUser,
) {
  if (user.role !== "student") throw new ForbiddenError("Students only");
  const driver = resolveDriver();
  if (!onlineCheckoutAvailable()) {
    throw new BusinessRuleError("Online payments are not available yet");
  }

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

export async function settleWalletTopUpFromIntentTx(
  tx: TenantTx,
  intentId: string,
  opts: { gatewayRef: string | null },
): Promise<SettleNotification> {
  const intent = await tx.paymentIntent.findUnique({ where: { id: intentId } });
  if (!intent) throw new NotFoundError("Intent vanished during settlement");
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

export { topUpWalletCash } from "@repo/server-core/services/wallet/cash-topup";

// Whose wallet this request is allowed to read. A student reads only their own;
// a parent reads an approved child's, and must name which one. Read-only in
// both cases -- nothing here spends a balance.
async function resolveWalletSubject(
  tx: TenantTx,
  user: SessionUser,
  studentId?: string,
): Promise<string> {
  if (user.role === "student") {
    if (studentId && studentId !== user.id) {
      throw new ForbiddenError("A student can only read their own wallet");
    }
    return user.id;
  }
  if (user.role === "parent") {
    if (!studentId) {
      throw new BusinessRuleError("studentId is required — choose which child");
    }
    await assertApprovedChild(tx, user.id, studentId);
    return studentId;
  }
  throw new ForbiddenError("Students and parents only");
}

export async function getWalletForStudent(user: SessionUser, studentId?: string) {
  return platformDb(async (tx) => {
    const subjectId = await resolveWalletSubject(tx, user, studentId);
    const profile = await tx.studentProfile.findUnique({
      where: { userId: subjectId },
      select: { walletBalance: true },
    });
    const settings = await getWalletSettings(tx);
    return {
      studentId: subjectId,
      balance: profile?.walletBalance ?? 0,
      currency: "EGP",
      minTopup: settings.minTopup,
      maxTopup: settings.maxTopup,
    };
  });
}

export async function listWalletHistory(
  user: SessionUser,
  opts?: { limit?: number; studentId?: string },
) {
  const limit = Math.min(200, Math.max(1, opts?.limit ?? 50));
  return platformDb(async (tx) => {
    const subjectId = await resolveWalletSubject(tx, user, opts?.studentId);
    const rows = await tx.walletLedger.findMany({
      where: { studentId: subjectId },
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
