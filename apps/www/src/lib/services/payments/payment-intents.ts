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
import { resolveDriver, type WebhookEvent } from "./gateway";

const INTENT_TTL_MS = 60 * 60 * 1000; // 1h checkout window

function formatReceiptNumber(shortId: string, seq: number): string {
  const year = new Date().getFullYear();
  return `RCP-${shortId}-${year}-${String(seq).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------------
// Initiate
// ---------------------------------------------------------------------------

export async function initiatePayment(
  input: { courseId: string; method: "card" | "wallet"; idempotencyKey: string },
  user: SessionUser,
) {
  if (user.role !== "student") throw new ForbiddenError("Students only");

  const driver = resolveDriver();

  const { intent, student } = await platformDb(
    async (tx) => {
      // Same idempotency key -> return the existing intent untouched (client
      // retries of the initiate call must not create duplicate charges).
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

      // THE amount: server-side snapshot of the course price. Any amount a
      // client sends is ignored by the route (it is not even in the schema).
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

  // Existing intent (idempotent retry): return as-is with no new gateway call.
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

/**
 * Step 4: intent that pays for a SUBSCRIPTION. The amount is the
 * subscription's server-side price snapshot; settlement activates the
 * subscription instead of the bare-course Payment path.
 */
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
  // A parent checking out for their child pays as themselves; the student stays
  // the beneficiary. NULL for a student, which is what every pre-existing
  // subscription intent means.
  const payerUserId = user.role === "parent" ? user.id : null;

  const { intent, payer } = await platformDb(
    async (tx) => {
      const existing = await tx.paymentIntent.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        // The key's owner is whoever is PAYING — the payer when someone else is
        // funding it, otherwise the student. For a student both are `user.id`,
        // so this check is unchanged for them.
        const principal = existing.payerUserId ?? existing.studentId;
        if (principal !== user.id) {
          throw new ForbiddenError("Idempotency key belongs to another user");
        }
        return { intent: existing, payer: null };
      }
      // Billing contact at the gateway is the ACTOR — it is their card.
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

// ---------------------------------------------------------------------------
// Read (owner polling)
// ---------------------------------------------------------------------------

/**
 * Poll an intent you own. "Own" means you are the one PAYING for it: a student
 * for their own intents, a parent for the ones they funded. A parent is
 * deliberately NOT given access to intents their child created — that is the
 * child's checkout, not theirs, and parent oversight is a separate read surface
 * with its own rules.
 */
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

// ---------------------------------------------------------------------------
// Webhook processing (shared by real callbacks and mock-complete)
// ---------------------------------------------------------------------------

export type WebhookOutcome =
  | { handled: true; intentId: string; result: "paid" | "failed" | "replay" | "not_pending" }
  | { handled: false; reason: string };

/**
 * Notification to fire AFTER a settlement transaction commits — a failed
 * notify must never roll back settled money. Returned by the settle helpers
 * so processWebhookEvent can send it post-commit.
 */
// Declared in the kernel (the subscription settlement path there returns this
// shape). Imported for local use AND re-exported, so every www import works.
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

  // M1: claim + settlement run in ONE transaction. If settlement throws, the
  // pending->paid claim rolls back with it, so the intent stays `pending` and
  // a webhook redelivery settles cleanly — a charged-but-empty intent can no
  // longer exist. Still idempotent: the claim's `updateMany where pending`
  // takes a row lock, so a concurrent second delivery blocks then sees 0
  // pending rows and no-ops.
  // Resolve the settler by the intent's target/purpose (before the tx):
  //  wallet_topup -> credit the student wallet; parent_wallet_topup -> credit
  //  the parent wallet; subscription -> activate the sub; else -> the
  //  bare-course Payment path. Each runs INSIDE the claim tx below.
  let settle: (tx: TenantTx) => Promise<SettleNotification | null>;
  if (intent.purpose === "wallet_topup") {
    const { settleWalletTopUpFromIntentTx } = await import("@/lib/services/wallet/wallet");
    settle = (tx) =>
      settleWalletTopUpFromIntentTx(tx, intent.id, { gatewayRef: event.gatewayRef });
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
        // Who paid at the gateway — a parent, or NULL for the student themselves.
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

      // Settle inside the SAME transaction as the claim.
      const toNotify = await settle(tx);

      return { result: { handled: true, intentId: intent.id, result: "paid" }, toNotify };
    },
  );

  // Notifications AFTER commit — a notify failure cannot un-settle the money.
  if (toNotify) {
    await notify({
      // `recipients` overrides the default student+parents fan-out — set only by
      // the parent top-up, where there is no child to notify.
      recipients: toNotify.recipients ?? (await studentAndParents(toNotify.studentId)),
      type: toNotify.type,
      title: toNotify.title,
      body: toNotify.body,
      data: toNotify.data,
    });

    // Emailed receipt. Reads the receipt number the settler already recorded on
    // the notification, so no settlement path changed to enable this. A wallet
    // top-up carries none (it writes no Payment row) and correctly gets none.
    const receiptNumber = receiptNumberFrom(toNotify.data);
    if (receiptNumber) {
      // Fire-and-forget: this runs after money has committed AND after the
      // in-app notification, so nothing downstream is waiting on the SMTP
      // round-trip. `sendPaymentReceiptEmail` never throws.
      void sendPaymentReceiptEmail(receiptNumber, "card");

      // Funnel step 4, attributed to the PAYEE — "did this center/teacher start
      // collecting money?", not "did this student pay?". Never throws, and
      // fires only on the payee's very first payment.
      void trackFirstPayment(receiptNumber, "card");
    }
  }
  return result;
}

/**
 * Settlement for a successfully paid intent, run WITHIN the webhook claim
 * transaction (M1) so charge and fulfillment are atomic: Payment row (receipt
 * via the center sequence), immutable Transaction (type payment,
 * online_paymob), points event. Amounts come from the intent row only.
 * Returns the notification to fire after the tx commits.
 */
async function settleIntentTx(tx: TenantTx, intentId: string): Promise<SettleNotification> {
  const intent = await tx.paymentIntent.findUnique({ where: { id: intentId } });
  if (!intent) throw new NotFoundError("Intent vanished during settlement");
  if (!intent.centerId) {
    // Cannot happen today (initiate requires a centered course); guards
    // the Step 4 teacher-direct future from silently mis-settling.
    throw new BusinessRuleError("Intent has no center to settle against");
  }
  // studentId is nullable ONLY for a parent wallet top-up, which is routed to
  // its own settler and never reaches here. Asserted rather than `!`-silenced,
  // so a future purpose that forgets its own settler fails loudly instead of
  // writing a Payment row with an empty student.
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

// ---------------------------------------------------------------------------
// Expiry (cron)
// ---------------------------------------------------------------------------

export async function expirePaymentIntents(now: Date) {
  const res = await platformDb((tx) =>
    tx.paymentIntent.updateMany({
      where: { status: "pending", expiresAt: { lt: now } },
      data: { status: "expired" },
    }),
  );
  return { expired: res.count };
}
