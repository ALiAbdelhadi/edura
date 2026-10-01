import { platformDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import { NotFoundError, ForbiddenError, BusinessRuleError } from "../../errors/classes";
import { signMockWebhook, resolveDriver } from "./gateway/index";
import { processWebhookEvent } from "./payment-intents";

export async function mockCompletePaymentIntent(
  user: SessionUser,
  id: string,
  outcome: "success" | "failure",
) {
  const intent = await platformDb((tx) =>
    tx.paymentIntent.findUnique({ where: { id } }),
  );
  if (!intent) throw new NotFoundError("Payment intent not found");
  const owns =
    (user.role === "student" &&
      intent.payerUserId === null &&
      intent.studentId === user.id) ||
    (user.role === "parent" && intent.payerUserId === user.id) ||
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
    amount_cents: intent.amount,
    currency: intent.currency,
    gateway_ref: `mocktxn_${intent.id.slice(0, 8)}`,
    reason: outcome === "failure" ? "Simulated decline (mock)" : undefined,
  });
  const hmac = signMockWebhook(rawBody);

  const verification = resolveDriver().verifyWebhook(rawBody, { hmac });
  if (!verification.valid) {
    throw new BusinessRuleError(`Mock signature failed: ${verification.error}`);
  }

  return processWebhookEvent(verification.event, JSON.parse(rawBody));
}
