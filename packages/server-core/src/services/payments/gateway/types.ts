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

export type WebhookEventKind = "capture" | "auth" | "void" | "refund" | "pending" | "failed";

export type WebhookEvent = {
  gatewayOrderId: string;
  gatewayRef: string | null;
  kind: WebhookEventKind;
  success: boolean;
  amountMinor: number | null;
  currency: string | null;
  integrationId: string | null;
  parentRef: string | null;
  reason: string | null;
  occurredAt: Date | null;
};

export type WebhookVerification =
  | { valid: true; event: WebhookEvent }
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
  is_refund?: boolean;
  is_void?: boolean;
  is_auth?: boolean;
  is_capture?: boolean;
  is_standalone_payment?: boolean;
};

export function deriveEventKind(f: ProviderFlags): WebhookEventKind {
  if (f.is_refunded === true || f.is_refund === true) return "refund";
  if (f.is_voided === true || f.is_void === true) return "void";
  if (f.pending === true) return "pending";
  if (f.is_auth === true && f.is_capture !== true) return "auth";
  if (f.success === true) return "capture";
  return "failed";
}

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