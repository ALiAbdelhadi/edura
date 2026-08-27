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

export type WebhookEvent = {
  gatewayOrderId: string;
  success: boolean;
  gatewayRef: string | null;
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

  createCheckout(
    intent: PaymentIntent,
    student: CheckoutStudent,
  ): Promise<CreateCheckoutResult>;

  verifyWebhook(
    rawBody: string,
    query: Record<string, string>,
  ): WebhookVerification;
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
