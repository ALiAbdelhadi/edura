import type { PaymentIntent } from "@repo/database";
import { BusinessRuleError } from "@/lib/errors/classes";
import type {
  CheckoutStudent,
  CreateCheckoutResult,
  PaymentGatewayDriver,
  WebhookVerification,
} from "./types";

// ---------------------------------------------------------------------------
// PAYMOB DRIVER — EMPTY STUB (Step 3). The real integration is wired later.
//
// Scope when implemented: card iframe + mobile wallets ONLY (no kiosk/Aman,
// no Fawry this phase). All credentials come from env:
//   PAYMOB_API_KEY, PAYMOB_HMAC_SECRET,
//   PAYMOB_INTEGRATION_ID_CARD, PAYMOB_INTEGRATION_ID_WALLET, PAYMOB_IFRAME_ID
// ---------------------------------------------------------------------------

const NOT_IMPLEMENTED =
  "Paymob driver not implemented yet — run with PAYMENTS_MODE=mock for now";

export const paymobDriver: PaymentGatewayDriver = {
  name: "paymob",

  async createCheckout(
    _intent: PaymentIntent,
    _student: CheckoutStudent,
  ): Promise<CreateCheckoutResult> {
    // TODO(paymob 1/4): AUTH TOKEN
    //   POST https://accept.paymob.com/api/auth/tokens
    //   body: { api_key: process.env.PAYMOB_API_KEY }
    //   -> { token } (short-lived; fetch per checkout, do not cache long-term)
    //
    // TODO(paymob 2/4): ORDER REGISTRATION
    //   POST https://accept.paymob.com/api/ecommerce/orders
    //   body: { auth_token, amount_cents: intent.amount, currency: intent.currency,
    //           merchant_order_id: intent.id, items: [] }
    //   -> { id: paymobOrderId }  — store as gatewayOrderId (webhook anchor).
    //   NOTE: amount_cents comes from the INTENT ROW ONLY (server-side truth).
    //
    // TODO(paymob 3/4): PAYMENT KEY
    //   POST https://accept.paymob.com/api/acceptance/payment_keys
    //   body: { auth_token, amount_cents: intent.amount, order_id: paymobOrderId,
    //           currency, expiration: secondsUntil(intent.expiresAt),
    //           integration_id: intent.method === "card"
    //             ? process.env.PAYMOB_INTEGRATION_ID_CARD
    //             : process.env.PAYMOB_INTEGRATION_ID_WALLET,
    //           billing_data: { email/phone/name from `student`, "NA" fallbacks } }
    //   -> { token: paymentKey }
    //
    // TODO(paymob 4/4): HAND-OFF
    //   card  -> kind "iframe":
    //     https://accept.paymob.com/api/acceptance/iframes/${PAYMOB_IFRAME_ID}?payment_token=${paymentKey}
    //   wallet -> kind "redirect":
    //     POST https://accept.paymob.com/api/acceptance/payments/pay
    //     body: { source: { identifier: <wallet phone>, subtype: "WALLET" }, payment_token: paymentKey }
    //     -> { redirect_url }
    throw new BusinessRuleError(NOT_IMPLEMENTED);
  },

  verifyWebhook(
    _rawBody: string,
    _query: Record<string, string>,
  ): WebhookVerification {
    // TODO(paymob HMAC): verify transaction-processed callbacks.
    //   1. Parse body JSON -> obj.obj (Paymob nests the transaction object).
    //   2. Concatenate the values of these fields IN EXACTLY THIS ORDER:
    //      amount_cents, created_at, currency, error_occured, has_parent_transaction,
    //      id, integration_id, is_3d_secure, is_auth, is_capture, is_refunded,
    //      is_standalone_payment, is_voided, order.id, owner, pending,
    //      source_data.pan, source_data.sub_type, source_data.type, success
    //      (booleans as "true"/"false", missing as "").
    //   3. HMAC-SHA512(concatenated, key=process.env.PAYMOB_HMAC_SECRET) hex
    //      must equal the `hmac` querystring param. REQUIRE the secret —
    //      no fallback in sandbox/live.
    //   4. Normalize -> { gatewayOrderId: String(obj.order.id),
    //                     success: obj.success === true,
    //                     gatewayRef: String(obj.id), reason: obj.data?.message ?? null }
    //   NOTE: never read the amount from the callback for settlement — the
    //   intent row is the only source of truth; optionally ASSERT
    //   obj.amount_cents === intent.amount and flag mismatches.
    return { valid: false, error: NOT_IMPLEMENTED };
  },
};
