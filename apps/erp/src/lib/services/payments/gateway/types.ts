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
  const raw = process.env.PAYMENTS_MODE?.toLowerCase();
  const isProd = process.env.NODE_ENV === "production";

  // C1: production must NEVER silently default to the mock gateway. Require an
  // explicit, valid PAYMENTS_MODE or fail closed (a request-time hard-fail —
  // handlers never run with an ambiguous gateway).
  if (isProd && !raw) {
    throw new Error(
      "PAYMENTS_MODE must be explicitly set in production (mock | sandbox | live)",
    );
  }
  const mode = raw ?? "mock";
  if (mode === "mock" || mode === "sandbox" || mode === "live") return mode;
  if (isProd) {
    throw new Error(`Invalid PAYMENTS_MODE "${raw}" in production`);
  }
  return "mock";
}
