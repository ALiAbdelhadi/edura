import { platformDb, type TenantTx } from "../../db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import type { Prisma } from "@repo/database";
import { nextTxnRef } from "../finance/ref-numbers";
import { resolveDriver, onlineCheckoutAvailable } from "../payments/gateway";
import type { SettleNotification } from "../payments/payment-intents";
import {
  getWalletSettings,
  assertTopupAllowed,
} from "./wallet";
import { parentWalletCredit } from "./parent-wallet";

export {
  parentWalletCredit,
  parentWalletDebit,
  reconcileParentWallet,
  assertApprovedChild,
  approvedChildIds,
  INSUFFICIENT_PARENT_WALLET,
} from "./parent-wallet";

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

export async function initiateParentWalletTopUpIntent(
  input: { amount: number; method: "card" | "wallet"; idempotencyKey: string },
  user: SessionUser,
) {
  if (user.role !== "parent") throw new ForbiddenError("Parents only");
  // Availability first: in production with PAYMENTS_MODE=mock the driver
  // refuses to exist (M-07), and the caller deserves the 422 not the throw.
  if (!onlineCheckoutAvailable()) {
    throw new BusinessRuleError("Online payments are not available yet");
  }
  const driver = resolveDriver();

  const { intent, parent } = await platformDb(
    async (tx) => {
      const existing = await tx.paymentIntent.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (existing.payerUserId !== user.id) {
          throw new ForbiddenError("Idempotency key belongs to another user");
        }
        return { intent: existing, parent: null };
      }

      await assertTopupAllowed(tx, user.id, input.amount);

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

export async function settleParentWalletTopUpFromIntentTx(
  tx: TenantTx,
  intentId: string,
  opts: { gatewayRef: string | null },
): Promise<SettleNotification> {
  const intent = await tx.paymentIntent.findUnique({ where: { id: intentId } });
  if (!intent) throw new NotFoundError("Intent vanished during settlement");
  if (!intent.payerUserId) {
    throw new NotFoundError("Parent top-up intent has no payer");
  }
  const parentId = intent.payerUserId;

  const receiptNumber = await nextPlatformReceipt(tx);

  const payment = await tx.payment.create({
    data: {
      centerId: null, // platform-held float, NOT center revenue
      studentId: null, // no beneficiary child until the money is spent
      payerUserId: parentId, // who actually paid — and who owns this receipt
      courseId: null,
      amount: intent.amount,
      paymentMethod: "online_paymob",
      note: "Parent wallet top-up (online)",
      receiptNumber,
      recordedBy: parentId, // self-service
      paidAt: new Date(),
    },
  });

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
    paymentId: payment.id,
    paymentIntentId: intent.id,
    relatedTxnId: transaction.id,
    reason: "Online wallet top-up",
    recordedBy: parentId, // self-service
  });

  await tx.paymentIntent.update({
    where: { id: intent.id },
    data: { paymentId: payment.id, transactionId: transaction.id },
  });

  return {
    studentId: parentId,
    recipients: [parentId],
    type: "payment_recorded",
    title: "Wallet topped up",
    body: `${(intent.amount / 100).toFixed(2)} EGP was added to your wallet. Receipt ${receiptNumber}.`,
    data: {
      paymentId: payment.id,
      receiptNumber,
      amount: intent.amount,
      balanceAfter,
      parentId,
    },
  };
}

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
