import { platformDb } from "@/lib/db/scope";
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";
import type { Prisma } from "@repo/database";
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

// ---------------------------------------------------------------------------
// Read (owner polling)
// ---------------------------------------------------------------------------

export async function getIntentForStudent(intentId: string, user: SessionUser) {
  const intent = await platformDb((tx) =>
    tx.paymentIntent.findUnique({ where: { id: intentId } }),
  );
  if (!intent) throw new NotFoundError("Payment intent not found");
  if (user.role !== "student" || intent.studentId !== user.id) {
    throw new ForbiddenError();
  }
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

export async function processWebhookEvent(
  event: WebhookEvent,
  rawPayload: unknown,
): Promise<WebhookOutcome> {
  const intent = await platformDb((tx) =>
    tx.paymentIntent.findUnique({ where: { gatewayOrderId: event.gatewayOrderId } }),
  );
  if (!intent) return { handled: false, reason: "Unknown gateway_order_id" };

  const payloadJson = rawPayload as Prisma.InputJsonValue;

  // Idempotent claim — the same trick as Session.distributedAt: only ONE
  // caller can move the intent out of `pending`. Replays and races fall
  // through to a no-op 200.
  const claim = await platformDb((tx) =>
    tx.paymentIntent.updateMany({
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
    }),
  );
  if (claim.count === 0) {
    return {
      handled: true,
      intentId: intent.id,
      result: intent.status === "paid" ? "replay" : "not_pending",
    };
  }

  if (!event.success) {
    return { handled: true, intentId: intent.id, result: "failed" };
  }

  await settleIntent(intent.id);
  return { handled: true, intentId: intent.id, result: "paid" };
}

/**
 * Settlement for a successfully paid intent (runs exactly once — the caller
 * holds the pending->paid claim): Payment row (receipt via the center
 * sequence), immutable Transaction (type payment, online_paymob), points
 * event, notification. Amounts come from the intent row only.
 *
 * NOTE (ledger consistency): cash payments do NOT write Transactions yet, so
 * the accountant ledger is online-only until the Step 4 reconciliation
 * (tracked prominently in CLAUDE.md decision #11).
 */
async function settleIntent(intentId: string): Promise<void> {
  const { receiptNumber, paymentId, amount, studentId } = await platformDb(
    async (tx) => {
      const intent = await tx.paymentIntent.findUnique({ where: { id: intentId } });
      if (!intent) throw new NotFoundError("Intent vanished during settlement");
      if (!intent.centerId) {
        // Cannot happen today (initiate requires a centered course); guards
        // the Step 4 teacher-direct future from silently mis-settling.
        throw new BusinessRuleError("Intent has no center to settle against");
      }

      const center = await tx.center.update({
        where: { id: intent.centerId },
        data: { receiptSeq: { increment: 1 } },
      });
      const receiptNumber = formatReceiptNumber(center.shortId, center.receiptSeq);

      const payment = await tx.payment.create({
        data: {
          centerId: intent.centerId,
          studentId: intent.studentId,
          courseId: intent.courseId,
          amount: intent.amount,
          note: `Online payment (${intent.gateway}/${intent.method})`,
          receiptNumber,
          recordedBy: intent.studentId, // self-service online payment
          paidAt: new Date(),
        },
      });

      const refNumber = await nextTxnRef(tx);
      const transaction = await tx.transaction.create({
        data: {
          refNumber,
          type: "payment",
          amount: intent.amount,
          fromEntityId: intent.studentId,
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

      await awardPoints(tx, intent.studentId, "online_payment", {
        reason: "Online payment",
      });

      return {
        receiptNumber,
        paymentId: payment.id,
        amount: intent.amount,
        studentId: intent.studentId,
      };
    },
    // No session here (gateway callback) — audit actor stays system/null;
    // the intent row keeps the full trace (payload, refs, linkage).
  );

  await notify({
    recipients: await studentAndParents(studentId),
    type: "payment_recorded",
    title: "Payment received",
    body: `Receipt ${receiptNumber} has been issued.`,
    data: { paymentId, receiptNumber, amount, studentId },
  });
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
