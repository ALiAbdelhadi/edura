import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentIntent } from "@repo/database";
import type {
  CheckoutStudent,
  CreateCheckoutResult,
  PaymentGatewayDriver,
  WebhookVerification,
} from "./types";

const MOCK_HMAC_FALLBACK = "edura-mock-hmac";

export function mockHmacSecret(): string {
  const secret = process.env.PAYMOB_HMAC_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("PAYMOB_HMAC_SECRET is required in production (no mock fallback)");
  }
  return MOCK_HMAC_FALLBACK;
}

export function signMockWebhook(rawBody: string): string {
  return createHmac("sha512", mockHmacSecret()).update(rawBody).digest("hex");
}

export const mockDriver: PaymentGatewayDriver = {
  name: "mock",

  async createCheckout(
    intent: PaymentIntent,
    _student: CheckoutStudent,
  ): Promise<CreateCheckoutResult> {
    return {
      gatewayOrderId: `mock_${intent.id}`,
      checkout: {
        kind: intent.method === "card" ? "iframe" : "redirect",
        url: `/payments/mock-checkout?intentId=${intent.id}`,
      },
    };
  },

  verifyWebhook(
    rawBody: string,
    query: Record<string, string>,
  ): WebhookVerification {
    const provided = query.hmac ?? "";
    if (!provided) return { valid: false, error: "Missing hmac" };
    const expected = signMockWebhook(rawBody);
    const providedBuf = Buffer.from(provided);
    const expectedBuf = Buffer.from(expected);
    if (
      providedBuf.length !== expectedBuf.length ||
      !timingSafeEqual(providedBuf, expectedBuf)
    ) {
      return { valid: false, error: "Invalid hmac" };
    }

    let payload: {
      gateway_order_id?: string;
      success?: boolean;
      gateway_ref?: string;
      reason?: string;
    };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { valid: false, error: "Invalid JSON body" };
    }
    if (!payload.gateway_order_id) {
      return { valid: false, error: "Missing gateway_order_id" };
    }

    return {
      valid: true,
      event: {
        gatewayOrderId: payload.gateway_order_id,
        success: payload.success === true,
        gatewayRef: payload.gateway_ref ?? null,
        reason: payload.reason ?? null,
      },
    };
  },
};
