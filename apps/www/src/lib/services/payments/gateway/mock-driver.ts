import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentIntent } from "@repo/database";
import type {
  CheckoutStudent,
  CreateCheckoutResult,
  PaymentGatewayDriver,
  WebhookVerification,
} from "./types";

// Dev-only fallback so PAYMENTS_MODE=mock needs zero env configuration.
// The real paymob driver will REQUIRE PAYMOB_HMAC_SECRET (no fallback).
const MOCK_HMAC_FALLBACK = "edura-mock-hmac";

export function mockHmacSecret(): string {
  const secret = process.env.PAYMOB_HMAC_SECRET;
  if (secret) return secret;
  // C1: never use the in-repo fallback secret in production — a public signing
  // key would let anyone forge a settlement. Require the real secret.
  if (process.env.NODE_ENV === "production") {
    throw new Error("PAYMOB_HMAC_SECRET is required in production (no mock fallback)");
  }
  return MOCK_HMAC_FALLBACK;
}

/**
 * Signs a raw webhook body the same way the paymob driver will verify it
 * (HMAC-SHA512, hex). Exported so the mock-complete endpoint can synthesize
 * a correctly-signed callback and exercise the REAL webhook path.
 */
export function signMockWebhook(rawBody: string): string {
  return createHmac("sha512", mockHmacSecret()).update(rawBody).digest("hex");
}

/**
 * Mock gateway — fully local, no external calls. Simulates the Paymob
 * lifecycle: checkout "url" is a placeholder the UI can show, and settlement
 * only ever happens through the webhook endpoint (triggered manually via
 * POST /api/v1/payments/intents/[id]/mock-complete).
 */
export const mockDriver: PaymentGatewayDriver = {
  name: "mock",

  async createCheckout(
    intent: PaymentIntent,
    _student: CheckoutStudent,
  ): Promise<CreateCheckoutResult> {
    return {
      gatewayOrderId: `mock_${intent.id}`,
      checkout: {
        // Card = iframe, wallet = redirect — mirrors how real Paymob behaves,
        // so the client integration shape won't change later.
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
    // C1: constant-time compare so the HMAC can't be recovered byte-by-byte
    // via response timing.
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
