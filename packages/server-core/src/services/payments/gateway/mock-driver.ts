import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentIntent } from "@repo/database";
import {
  deriveEventKind,
  type CheckoutStudent,
  type CreateCheckoutResult,
  type PaymentGatewayDriver,
  type WebhookVerification,
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

/**
 * The mock body mirrors the fields the real contract needs, so every test
 * exercises the same settlement gate a Paymob callback will (H-04). A body
 * with no `amount_cents` / `currency` is invalid, not "assume the intent".
 */
export type MockWebhookBody = {
  gateway_order_id: string;
  success: boolean;
  amount_cents: number;
  currency: string;
  gateway_ref?: string;
  reason?: string;
  integration_id?: string;
  is_refunded?: boolean;
  is_voided?: boolean;
  pending?: boolean;
  parent_transaction?: string;
};

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
    // M-07: unconditional, before any HMAC work — a correctly signed mock body
    // must never verify in production, whatever selected this driver.
    if (process.env.NODE_ENV === "production") {
      return { valid: false, error: "Mock gateway is disabled in production" };
    }
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

    let payload: Partial<MockWebhookBody>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { valid: false, error: "Invalid JSON body" };
    }
    if (!payload.gateway_order_id) {
      return { valid: false, error: "Missing gateway_order_id" };
    }
    if (!Number.isInteger(payload.amount_cents) || typeof payload.currency !== "string") {
      return { valid: false, error: "Missing amount_cents / currency" };
    }

    const success = payload.success === true;
    return {
      valid: true,
      event: {
        gatewayOrderId: payload.gateway_order_id,
        gatewayRef: payload.gateway_ref ?? null,
        kind: deriveEventKind({
          success,
          pending: payload.pending,
          is_refunded: payload.is_refunded,
          is_voided: payload.is_voided,
        }),
        success: success && payload.pending !== true,
        amountMinor: payload.amount_cents as number,
        currency: payload.currency,
        integrationId: payload.integration_id ?? null,
        parentRef: payload.parent_transaction ?? null,
        reason: payload.reason ?? null,
        occurredAt: null,
      },
    };
  },
};
