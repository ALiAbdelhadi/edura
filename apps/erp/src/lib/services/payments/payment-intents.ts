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
import { resolveFinanceStaff } from "@/lib/services/notifications/fanout";
import {
  resolveDriver,
  type WebhookEvent,
  onlineCheckoutAvailable,
  integrationAllowed,
} from "./gateway";

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

  // Availability first: in production with PAYMENTS_MODE=mock the driver
  // refuses to exist (M-07), and the caller deserves the 422 not the throw.
  if (!onlineCheckoutAvailable()) {
    throw new BusinessRuleError("Online payments are not available yet");
  }
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
  // Availability first: in production with PAYMENTS_MODE=mock the driver
  // refuses to exist (M-07), and the caller deserves the 422 not the throw.
  if (!onlineCheckoutAvailable()) {
    throw new BusinessRuleError("Online payments are not available yet");
  }
  const driver = resolveDriver();
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
  | {
      handled: true;
      intentId: string;
      result:
        | "paid"
        | "paid_late"
        | "failed"
        | "replay"
        | "not_pending"
        | "needs_review"
        | "ignored";
    }
  | { handled: false; reason: string };

export type { SettleNotification };

type IntentRow = Prisma.PaymentIntentGetPayload<Record<string, never>>;

async function tellFinance(title: string, body: string, data: Record<string, unknown>) {
  const staff = await resolveFinanceStaff();
  if (staff.length === 0) return;
  await notify({ recipients: staff, type: "payment_recorded", title, body, data });
}

/**
 * SECURITY_AUDIT.md H-04, rules 2–4 of Phase 3 §3.3.1. A capture settles only
 * when the provider says it captured EXACTLY what the intent asked for, from an
 * integration this deployment owns. Anything else is a reason, never a booking.
 */
function captureMismatch(intent: IntentRow, event: WebhookEvent): string | null {
  if (event.amountMinor !== intent.amount) {
    return `amount_mismatch: got ${event.amountMinor ?? "none"} expected ${intent.amount}`;
  }
  if ((event.currency ?? "").toUpperCase() !== intent.currency.toUpperCase()) {
    return `currency_mismatch: got ${event.currency ?? "none"} expected ${intent.currency}`;
  }
  if (!integrationAllowed(event.integrationId)) {
    return `unknown_integration: ${event.integrationId ?? "none"}`;
  }
  return null;
}

/**
 * Money moved at the provider and it does not match the intent. Nothing is
 * booked — the provider dashboard is the only truth now and a human has to
 * look — but the intent is parked as `needs_review` (migration 76) with the
 * reason, the payload is kept, and finance is told. The route still answers
 * 200 so the provider stops retrying the same mismatch.
 */
async function parkForReview(
  intent: IntentRow,
  event: WebhookEvent,
  payloadJson: Prisma.InputJsonValue,
  reason: string,
): Promise<WebhookOutcome> {
  const { parked, current } = await platformDb(async (tx) => {
    const parked = await tx.paymentIntent.updateMany({
      where: { id: intent.id, status: { in: ["pending", "expired"] } },
      data: {
        status: "needs_review",
        failureReason: reason,
        gatewayRef: event.gatewayRef,
        webhookPayload: payloadJson,
      },
    });
    const current = await tx.paymentIntent.findUniqueOrThrow({
      where: { id: intent.id },
      select: { status: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: null,
        action: "payment.webhook_rejected",
        targetType: "payment_intent",
        targetId: intent.id,
        centerId: intent.centerId,
        beforeState: { status: intent.status, amount: intent.amount, currency: intent.currency },
        afterState: {
          status: current.status,
          reason,
          gatewayRef: event.gatewayRef,
          amountMinor: event.amountMinor,
          currency: event.currency,
          integrationId: event.integrationId,
          parked: parked.count === 1,
        },
      },
    });
    return { parked: parked.count === 1, current: current.status };
  });

  await tellFinance(
    "Payment needs review",
    `A capture for intent ${intent.id} did not match it (${reason}). Nothing was booked.`,
    { intentId: intent.id, reason, gatewayRef: event.gatewayRef, needsReview: true },
  );

  if (parked) return { handled: true, intentId: intent.id, result: "needs_review" };
  return {
    handled: true,
    intentId: intent.id,
    result: current === "paid" ? "replay" : "not_pending",
  };
}

/**
 * Refund and void callbacks. A void before capture simply fails the intent. A
 * void after capture, or any refund, is money going BACK that this code did not
 * arm — the executor + matching in Phase 3 §3.3.2 (M-05) is what will pair it
 * with an armed refund row; until then it is recorded and finance is told.
 */
async function handleReversalEvent(
  intent: IntentRow,
  event: WebhookEvent,
  payloadJson: Prisma.InputJsonValue,
): Promise<WebhookOutcome> {
  if (event.kind === "void") {
    const voided = await platformDb((tx) =>
      tx.paymentIntent.updateMany({
        where: { id: intent.id, status: { in: ["pending", "expired"] } },
        data: {
          status: "failed",
          failureReason: "voided by provider",
          gatewayRef: event.gatewayRef,
          webhookPayload: payloadJson,
        },
      }),
    );
    if (voided.count === 1) return { handled: true, intentId: intent.id, result: "failed" };
  }

  await platformDb((tx) =>
    tx.auditLog.create({
      data: {
        actorId: null,
        action: event.kind === "void" ? "payment.unsolicited_void" : "payment.unsolicited_refund",
        targetType: "payment_intent",
        targetId: intent.id,
        centerId: intent.centerId,
        afterState: {
          gatewayRef: event.gatewayRef,
          parentRef: event.parentRef,
          amountMinor: event.amountMinor,
          currency: event.currency,
          intentStatus: intent.status,
        },
      },
    }),
  );
  await tellFinance(
    event.kind === "void" ? "Provider voided a captured payment" : "Provider refund not armed here",
    `The provider reported a ${event.kind} of ${event.amountMinor ?? "?"} ${event.currency ?? ""} on intent ${intent.id} that no refund here arranged.`,
    { intentId: intent.id, kind: event.kind, gatewayRef: event.gatewayRef, amountMinor: event.amountMinor },
  );
  return { handled: true, intentId: intent.id, result: "ignored" };
}

export async function processWebhookEvent(
  event: WebhookEvent,
  rawPayload: unknown,
): Promise<WebhookOutcome> {
  const intent = await platformDb((tx) =>
    tx.paymentIntent.findUnique({ where: { gatewayOrderId: event.gatewayOrderId } }),
  );
  if (!intent) return { handled: false, reason: "Unknown gateway_order_id" };

  const payloadJson = rawPayload as Prisma.InputJsonValue;

  // ---- H-04: what kind of callback is this? Only a matching capture settles.
  if (event.kind === "pending" || event.kind === "auth") {
    await platformDb((tx) =>
      tx.paymentIntent.updateMany({
        where: { id: intent.id, status: { in: ["pending", "expired"] } },
        data: { webhookPayload: payloadJson },
      }),
    );
    return { handled: true, intentId: intent.id, result: "ignored" };
  }
  if (event.kind === "refund" || event.kind === "void") {
    return handleReversalEvent(intent, event, payloadJson);
  }
  if (event.kind === "capture" && event.success) {
    const mismatch = captureMismatch(intent, event);
    if (mismatch) return parkForReview(intent, event, payloadJson, mismatch);
  }

  let settle: (tx: TenantTx) => Promise<SettleNotification>;
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
      // Read inside the transaction so "was it expired?" and the claim agree.
      const before = await tx.paymentIntent.findUnique({
        where: { id: intent.id },
        select: { status: true, expiresAt: true },
      });
      const wasExpired = before?.status === "expired";

      // SECURITY_AUDIT.md H-03 rule 1: a SUCCESS claims `pending` OR `expired`.
      // Intent expiry is the checkout window the UI shows, not a money boundary
      // — if the provider captured after it, the money is real and is settled,
      // with an audit row so finance can see how often it happens. A FAILURE
      // still claims only `pending`: there is nothing to record on an expired
      // intent that did not capture.
      const claim = await tx.paymentIntent.updateMany({
        where: event.success
          ? { id: intent.id, status: { in: ["pending", "expired"] } }
          : { id: intent.id, status: "pending" },
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

      // H-03 rule 2: an intent is never `paid` without a `payments` row. Every
      // settle path links the row it wrote; if one did not, this throw rolls
      // the claim back, the provider retries, and the failure is loud (a 500
      // with the intent id) instead of a silent `paid` that books nothing.
      const linked = await tx.paymentIntent.findUniqueOrThrow({
        where: { id: intent.id },
        select: { paymentId: true },
      });
      if (!linked.paymentId) {
        throw new Error(
          `Settlement of intent ${intent.id} wrote no payment row — refusing to mark it paid`,
        );
      }

      if (wasExpired) {
        await tx.auditLog.create({
          data: {
            actorId: null,
            action: "payment.captured_after_expiry",
            targetType: "payment_intent",
            targetId: intent.id,
            centerId: intent.centerId,
            beforeState: { status: "expired", expiresAt: before?.expiresAt ?? null },
            afterState: {
              status: "paid",
              gatewayRef: event.gatewayRef,
              paymentId: linked.paymentId,
              amount: intent.amount,
            },
          },
        });
      }

      return {
        result: { handled: true, intentId: intent.id, result: wasExpired ? "paid_late" : "paid" },
        toNotify,
      };
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
