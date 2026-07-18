import type { PaymentIntent } from "@repo/database";

export type PaymentsMode = "mock" | "sandbox" | "live";

export type CheckoutInfo = {
  /** How the client should present the gateway step. */
  kind: "iframe" | "redirect";
  url: string;
};

export type CreateCheckoutResult = {
  /** Gateway-side order id — the webhook idempotency anchor. */
  gatewayOrderId: string;
  checkout: CheckoutInfo;
};

/** Gateway-agnostic shape of a webhook callback after verification. */
export type WebhookEvent = {
  gatewayOrderId: string;
  success: boolean;
  /** Gateway-side transaction reference (Paymob txn id). */
  gatewayRef: string | null;
  /** Human-readable failure reason when success=false. */
  reason: string | null;
};

export type WebhookVerification =
  | { valid: true; event: WebhookEvent }
  | { valid: false; error: string };

export type CheckoutStudent = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export interface PaymentGatewayDriver {
  readonly name: "mock" | "paymob";

  /**
   * Register the intent with the gateway and return where to send the user.
   * MUST NOT trust any client-provided amount — the intent row is the only
   * source of truth for the charge.
   */
  createCheckout(
    intent: PaymentIntent,
    student: CheckoutStudent,
  ): Promise<CreateCheckoutResult>;

  /**
   * Verify a webhook callback's authenticity (HMAC) and normalize it.
   * `rawBody` is the exact request body string; `query` carries any
   * querystring params the gateway appends (Paymob sends hmac there too).
   */
  verifyWebhook(
    rawBody: string,
    query: Record<string, string>,
  ): WebhookVerification;
}

export function paymentsMode(): PaymentsMode {
  const mode = (process.env.PAYMENTS_MODE ?? "mock").toLowerCase();
  if (mode === "sandbox" || mode === "live") return mode;
  return "mock";
}
