import { platformDb, type TenantTx } from "@/lib/db/scope";
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";
import type { Prisma } from "@repo/database";
import type { SettleNotification } from "@repo/server-core/services/payments/notification-types";
import {
  receiptNumberFrom,
  sendPaymentReceiptEmail,
} from "@repo/server-core/services/payments/receipt-email";
import { trackFirstPayment } from "@/lib/observability/funnel";
import { notify } from "@/lib/services/notifications/notify";
import { studentAndParents } from "@/lib/services/notifications/fanout";
import { awardPoints } from "@/lib/services/points/points";
import { nextTxnRef } from "@/lib/services/finance/ref-numbers";
import { resolveDriver, type WebhookEvent, onlineCheckoutAvailable } from "./gateway";

const INTENT_TTL_MS = 60 * 60 * 1000; // 1h checkout window

function formatReceiptNumber(shortId: string, seq: number): string {
  const year = new Date().getFullYear();
  return `RCP-${shortId}-${year}-${String(seq).padStart(5, "0")}`;
}

export async function initiatePayment(
  input: { courseId: string; method: "card" | "wallet"; idempotencyKey: string },
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

      const course = await tx.course.findFirst({
        where: { id: input.courseId, status: "active" },
        select: { id: true, centerId: true, price: true, title: true },
      });
      if (!course) throw new NotFoundError("Course not found or not active");
      if (course.price <= 0) {
        throw new BusinessRuleError("Course has no payable price");
      }

      const student = await tx.user.findUnique({
        where: { id: user.id },
        select: { id: true, name: true, email: true, phone: true },
      });

      const intent = await tx.paymentIntent.create({
        data: {
          studentId: user.id,
          courseId: course.id,
          centerId: course.centerId,
          amount: course.price,
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
    tx.paymentIntent.update({
      where: { id: intent.id },
      data: { gatewayOrderId },
    }),
  );

  return toClientIntent(updated, checkout);
}

export async function initiateSubscriptionIntent(
  sub: {
    id: string;
    studentId: string;
    courseId: string;
    centerId: string | null;
    price: number;
  },
  method: "card" | "wallet",
  idempotencyKey: string,
  user: SessionUser,
) {
  const driver = resolveDriver();
  if (!onlineCheckoutAvailable()) {
    throw new BusinessRuleError("Online payments are not available yet");
  }
  const payerUserId = user.role === "parent" ? user.id : null;

  const { intent, payer } = await platformDb(
    async (tx) => {
      const existing = await tx.paymentIntent.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        const principal = existing.payerUserId ?? existing.studentId;
        if (principal !== user.id) {
          throw new ForbiddenError("Idempotency key belongs to another user");
        }
        return { intent: existing, payer: null };
      }
      const payer = await tx.user.findUnique({
        where: { id: user.id },
        select: { id: true, name: true, email: true, phone: true },
      });
      const intent = await tx.paymentIntent.create({
        data: {
          studentId: sub.studentId,
          payerUserId,
          courseId: sub.courseId,
          subscriptionId: sub.id,
          centerId: sub.centerId,
          amount: sub.price,
          method,
          gateway: driver.name,
          idempotencyKey,
          expiresAt: new Date(Date.now() + INTENT_TTL_MS),
        },
      });
      await tx.subscription.update({
        where: { id: sub.id },
        data: { paymentIntentId: intent.id },
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

export async function getIntentForStudent(intentId: string, user: SessionUser) {
  const intent = await platformDb((tx) =>
    tx.paymentIntent.findUnique({ where: { id: intentId } }),
  );
  if (!intent) throw new NotFoundError("Payment intent not found");

  const owns =
    (user.role === "student" &&
      intent.payerUserId === null &&
      intent.studentId === user.id) ||
    (user.role === "parent" && intent.payerUserId === user.id);
  if (!owns) throw new ForbiddenError();

  return toClientIntent(intent, null);
}

function toClientIntent(
  intent: Prisma.PaymentIntentGetPayload<Record<string, never>>,
  checkout: { kind: string; url: string } | null,
) {
  return {
    id: intent.id,
    courseId: intent.courseId,
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

export type WebhookOutcome =
  | { handled: true; intentId: string; result: "paid" | "failed" | "replay" | "not_pending" }
  | { handled: false; reason: string };

export type { SettleNotification };

export async function processWebhookEvent(
  event: WebhookEvent,
  rawPayload: unknown,
): Promise<WebhookOutcome> {
  const intent = await platformDb((tx) =>
    tx.paymentIntent.findUnique({ where: { gatewayOrderId: event.gatewayOrderId } }),
  );
  if (!intent) return { handled: false, reason: "Unknown gateway_order_id" };

  const payloadJson = rawPayload as Prisma.InputJsonValue;

  let settle: (tx: TenantTx) => Promise<SettleNotification | null>;
  if (intent.purpose === "wallet_topup") {
    const { settleWalletTopUpFromIntentTx } = await import("@/lib/services/wallet/wallet");
    settle = (tx) =>
      settleWalletTopUpFromIntentTx(tx, intent.id, { gatewayRef: event.gatewayRef });
  } else if (intent.purpose === "center_credit_topup") {
    const { settleCenterCreditTopUpFromIntentTx } = await import(
      "@/lib/services/wallet/center-credit-topup"
    );
    settle = (tx) =>
      settleCenterCreditTopUpFromIntentTx(tx, intent.id, { gatewayRef: event.gatewayRef });
  } else if (intent.purpose === "parent_wallet_topup") {
    const { settleParentWalletTopUpFromIntentTx } = await import(
      "@/lib/services/wallet/parent-wallet"
    );
    settle = (tx) =>
      settleParentWalletTopUpFromIntentTx(tx, intent.id, { gatewayRef: event.gatewayRef });
  } else if (intent.subscriptionId) {
    const { settleSubscriptionFromIntentTx } = await import(
      "@/lib/services/subscriptions/subscriptions"
    );
    settle = (tx) =>
      settleSubscriptionFromIntentTx(tx, intent.subscriptionId!, {
        id: intent.id,
        gatewayRef: event.gatewayRef,
        payerUserId: intent.payerUserId,
      });
  } else {
    settle = (tx) => settleIntentTx(tx, intent.id);
  }

  const { result, toNotify } = await platformDb(
    async (tx): Promise<{ result: WebhookOutcome & { handled: true }; toNotify: SettleNotification | null }> => {
      const claim = await tx.paymentIntent.updateMany({
        where: { id: intent.id, status: "pending" },
        data: event.success
          ? {
              status: "paid",
              paidAt: new Date(),
              gatewayRef: event.gatewayRef,
              webhookPayload: payloadJson,
            }
          : {
              status: "failed",
              failureReason: event.reason ?? "Payment failed",
              gatewayRef: event.gatewayRef,
              webhookPayload: payloadJson,
            },
      });
      if (claim.count === 0) {
        const cur = await tx.paymentIntent.findUnique({
          where: { id: intent.id },
          select: { status: true },
        });
        return {
          result: {
            handled: true,
            intentId: intent.id,
            result: cur?.status === "paid" ? "replay" : "not_pending",
          },
          toNotify: null,
        };
      }

      if (!event.success) {
        return { result: { handled: true, intentId: intent.id, result: "failed" }, toNotify: null };
      }

      const toNotify = await settle(tx);

      return { result: { handled: true, intentId: intent.id, result: "paid" }, toNotify };
    },
  );

  if (toNotify) {
    await notify({
      recipients: toNotify.recipients ?? (await studentAndParents(toNotify.studentId)),
      type: toNotify.type,
      title: toNotify.title,
      body: toNotify.body,
      data: toNotify.data,
    });

    const receiptNumber = receiptNumberFrom(toNotify.data);
    if (receiptNumber) {
      void sendPaymentReceiptEmail(receiptNumber, "card");

      void trackFirstPayment(receiptNumber, "card");
    }
  }
  return result;
}

async function settleIntentTx(tx: TenantTx, intentId: string): Promise<SettleNotification> {
  const intent = await tx.paymentIntent.findUnique({ where: { id: intentId } });
  if (!intent) throw new NotFoundError("Intent vanished during settlement");
  if (!intent.centerId) {
    throw new BusinessRuleError("Intent has no center to settle against");
  }
  const studentId = intent.studentId;
  if (!studentId) {
    throw new BusinessRuleError("Course intent has no student to settle for");
  }

  const center = await tx.center.update({
    where: { id: intent.centerId },
    data: { receiptSeq: { increment: 1 } },
  });
  const receiptNumber = formatReceiptNumber(center.shortId, center.receiptSeq);

  const payment = await tx.payment.create({
    data: {
      centerId: intent.centerId,
      studentId,
      courseId: intent.courseId,
      amount: intent.amount,
      paymentMethod: "online_paymob",
      note: `Online payment (${intent.gateway}/${intent.method})`,
      receiptNumber,
      recordedBy: studentId, // self-service online payment
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
      toEntityId: intent.centerId,
      centerId: intent.centerId,
      status: "completed",
      paymentMethod: "online_paymob",
      gatewayRef: intent.gatewayRef,
      notes: `Online course payment (intent ${intent.id})`,
    },
  });

  await tx.paymentIntent.update({
    where: { id: intent.id },
    data: { paymentId: payment.id, transactionId: transaction.id },
  });

  await awardPoints(tx, studentId, "online_payment", {
    reason: "Online payment",
  });

  return {
    studentId,
    type: "payment_recorded",
    title: "Payment received",
    body: `Receipt ${receiptNumber} has been issued.`,
    data: { paymentId: payment.id, receiptNumber, amount: intent.amount, studentId },
  };
}

export async function expirePaymentIntents(now: Date) {
  const res = await platformDb((tx) =>
    tx.paymentIntent.updateMany({
      where: { status: "pending", expiresAt: { lt: now } },
      data: { status: "expired" },
    }),
  );
  return { expired: res.count };
}
