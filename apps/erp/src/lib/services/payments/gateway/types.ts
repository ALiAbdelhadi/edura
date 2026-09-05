import type { PaymentIntent } from "@repo/database";

export type PaymentsMode = "mock" | "sandbox" | "live";

export type CheckoutInfo = {
  kind: "iframe" | "redirect";
  url: string;
};

export type CreateCheckoutResult = {
  gatewayOrderId: string;
  checkout: CheckoutInfo;
};

/**
 * What a provider callback IS, derived from its flags — never inferred from
 * `success` alone (SECURITY_AUDIT.md H-04). Only `capture` can settle.
 */
export type WebhookEventKind = "capture" | "auth" | "void" | "refund" | "pending" | "failed";

/**
 * The contract every driver must fill. Before H-04 this carried only
 * `{ gatewayOrderId, success, gatewayRef, reason }` and settlement booked
 * `intent.amount` on any `success: true` — so a partial capture, a voided
 * authorisation, a refund notification or a callback from a different
 * integration all looked like "paid in full for this order".
 */
export type WebhookEvent = {
  /** The order this callback is about (Paymob `obj.order.id`; mock `gateway_order_id`). */
  gatewayOrderId: string;
  /** The provider's TRANSACTION id (Paymob `obj.id`) — unique per callback. */
  gatewayRef: string | null;
  kind: WebhookEventKind;
  /** `obj.success && !obj.pending` for Paymob; `success === true` for mock. */
  success: boolean;
  /** Minor units — Paymob `amount_cents`, the same integer piasters the intent holds. */
  amountMinor: number | null;
  currency: string | null;
  /** Which of the merchant's integrations produced this (Paymob `integration_id`). */
  integrationId: string | null;
  /** The capture a refund/void reverses (Paymob `parent_transaction`). */
  parentRef: string | null;
  reason: string | null;
  occurredAt: Date | null;
};

export type WebhookVerification =
  | { valid: true; event: WebhookEvent }
  /**
   * `ignore: true` = a genuine but irrelevant callback (Paymob TOKEN /
   * DELIVERY_NEEDED). The route answers 200 so the provider stops retrying;
   * a plain `valid: false` answers 401.
   */
  | { valid: false; error: string; ignore?: boolean };

export type CheckoutStudent = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export interface PaymentGatewayDriver {
  readonly name: "mock" | "paymob";

  createCheckout(
    intent: PaymentIntent,
    student: CheckoutStudent,
  ): Promise<CreateCheckoutResult>;

  verifyWebhook(
    rawBody: string,
    query: Record<string, string>,
  ): WebhookVerification;
}

export type ProviderFlags = {
  success?: boolean;
  pending?: boolean;
  is_refunded?: boolean;
  is_voided?: boolean;
  is_auth?: boolean;
  is_capture?: boolean;
  is_standalone_payment?: boolean;
};

/** Paymob flag → kind table (Phase 3 §3.3.1). Order matters: reversal flags win. */
export function deriveEventKind(f: ProviderFlags): WebhookEventKind {
  if (f.is_refunded === true) return "refund";
  if (f.is_voided === true) return "void";
  if (f.pending === true) return "pending";
  if (f.is_auth === true && f.is_capture !== true) return "auth";
  if (f.success === true) return "capture";
  return "failed";
}

/**
 * The integrations this deployment settles for. Comma-separated
 * `PAYMOB_INTEGRATION_IDS`. `null` when unset — which the gate treats as
 * "everything" ONLY in mock mode; any real mode with no allow-list refuses
 * every capture as `unknown_integration`, so a missing variable fails closed.
 */
export function paymobIntegrationIds(): Set<string> | null {
  const raw = process.env.PAYMOB_INTEGRATION_IDS?.trim();
  if (!raw) return null;
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

export function integrationAllowed(integrationId: string | null): boolean {
  const allowed = paymobIntegrationIds();
  if (!allowed) return paymentsMode() === "mock";
  return integrationId !== null && allowed.has(integrationId);
}

export function onlineCheckoutAvailable(): boolean {
  return !(paymentsMode() === "mock" && process.env.NODE_ENV === "production");
}

export function paymentsMode(): PaymentsMode {
  const raw = process.env.PAYMENTS_MODE?.toLowerCase();
  const isProd = process.env.NODE_ENV === "production";

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
