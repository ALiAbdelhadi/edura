import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { NotFoundError, ForbiddenError, BusinessRuleError } from "@/lib/errors/classes";
import { platformDb } from "@/lib/db/scope";
import { paymentsMode, signMockWebhook } from "@/lib/services/payments/gateway";
import { resolveDriver } from "@/lib/services/payments/gateway";
import { processWebhookEvent } from "@/lib/services/payments/payment-intents";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ outcome: z.enum(["success", "failure"]) }).strict();

/**
 * MOCK MODE ONLY — simulates Paymob calling our webhook for this intent.
 * Builds a mock-signed payload and pushes it through the SAME verification +
 * idempotent processing path as the real webhook endpoint, so local testing
 * exercises HMAC checking and replay behavior for real.
 */
export const POST = withErrors(async (req, ctx) => {
  // C1: the mock settlement path must not exist in production, regardless of
  // any env config — 404 as if the route weren't there.
  if (process.env.NODE_ENV === "production") {
    throw new NotFoundError("Not found");
  }
  if (paymentsMode() !== "mock") {
    throw new BusinessRuleError("mock-complete is only available when PAYMENTS_MODE=mock");
  }

  const user = await requireRole("student", "parent", "center_admin");
  const { id } = await ctx.params;
  const { outcome } = await parseJson(req, bodySchema);

  const intent = await platformDb((tx) =>
    tx.paymentIntent.findUnique({ where: { id } }),
  );
  if (!intent) throw new NotFoundError("Payment intent not found");
  // Same ownership rule as the polling endpoint: you may only complete an
  // intent you are PAYING for — a student their own, a parent theirs.
  const owns =
    (user.role === "student" &&
      intent.payerUserId === null &&
      intent.studentId === user.id) ||
    (user.role === "parent" && intent.payerUserId === user.id) ||
    // Phase 4: a center owner completing their own credit top-up.
    (user.role === "center_admin" &&
      intent.purpose === "center_credit_topup" &&
      intent.payerUserId === user.id &&
      intent.centerId === user.centerId);
  if (!owns) throw new ForbiddenError();
  if (!intent.gatewayOrderId) {
    throw new BusinessRuleError("Intent has no gateway order yet");
  }

  const rawBody = JSON.stringify({
    gateway_order_id: intent.gatewayOrderId,
    success: outcome === "success",
    gateway_ref: `mocktxn_${intent.id.slice(0, 8)}`,
    reason: outcome === "failure" ? "Simulated decline (mock)" : undefined,
  });
  const hmac = signMockWebhook(rawBody);

  const verification = resolveDriver().verifyWebhook(rawBody, { hmac });
  if (!verification.valid) {
    throw new BusinessRuleError(`Mock signature failed: ${verification.error}`);
  }

  const result = await processWebhookEvent(verification.event, JSON.parse(rawBody));
  return ok(result);
});
