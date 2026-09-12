import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentIntent } from "@repo/database";
import { BusinessRuleError } from "@/lib/errors/classes";
import {
  deriveEventKind,
  type CheckoutStudent,
  type CreateCheckoutResult,
  type PaymentGatewayDriver,
  type WebhookVerification,
} from "./types";

const CHECKOUT_NOT_IMPLEMENTED =
  "Paymob checkout is not wired yet — run with PAYMENTS_MODE=mock for now";

/**
 * The fields Paymob signs on a TRANSACTION callback, in the exact lexicographic
 * order their HMAC is computed over. Nested keys are dotted paths into `obj`.
 * Booleans render as "true"/"false", everything else as its string form.
 */
export const PAYMOB_HMAC_FIELDS = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order.id",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success",
] as const;

type Json = Record<string, unknown>;

function pathValue(obj: Json, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, key) => {
    if (cur && typeof cur === "object") return (cur as Json)[key];
    return undefined;
  }, obj);
}

function render(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

export function paymobHmacSecret(): string {
  const secret = process.env.PAYMOB_HMAC_SECRET;
  if (!secret) throw new Error("PAYMOB_HMAC_SECRET is required for the Paymob driver");
  return secret;
}

/** HMAC-SHA512 over the concatenated field values, hex — Paymob's `hmac` query param. */
export function paymobTransactionHmac(obj: Json, secret = paymobHmacSecret()): string {
  const material = PAYMOB_HMAC_FIELDS.map((f) => render(pathValue(obj, f))).join("");
  return createHmac("sha512", secret).update(material).digest("hex");
}

export type PaymobTransactionObj = {
  id: number | string;
  amount_cents: number;
  currency: string;
  success: boolean;
  pending?: boolean;
  is_auth?: boolean;
  is_capture?: boolean;
  is_refunded?: boolean;
  is_voided?: boolean;
  is_refund?: boolean;
  is_void?: boolean;
  is_standalone_payment?: boolean;
  integration_id?: number | string;
  parent_transaction?: number | string | null;
  created_at?: string;
  order?: { id?: number | string };
  data?: { message?: string };
  acq_response_code?: string;
};

export const paymobDriver: PaymentGatewayDriver = {
  name: "paymob",

  async createCheckout(
    _intent: PaymentIntent,
    _student: CheckoutStudent,
  ): Promise<CreateCheckoutResult> {
    throw new BusinessRuleError(CHECKOUT_NOT_IMPLEMENTED);
  },

  verifyWebhook(
    rawBody: string,
    query: Record<string, string>,
  ): WebhookVerification {
    let payload: { type?: string; obj?: Json };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { valid: false, error: "Invalid JSON body" };
    }
    if (payload.type !== "TRANSACTION") {
      return { valid: false, error: `Ignored callback type ${payload.type ?? "?"}`, ignore: true };
    }
    const obj = payload.obj;
    if (!obj || typeof obj !== "object") return { valid: false, error: "Missing obj" };

    const provided = query.hmac ?? "";
    if (!provided) return { valid: false, error: "Missing hmac" };
    const expected = paymobTransactionHmac(obj);
    const providedBuf = Buffer.from(provided);
    const expectedBuf = Buffer.from(expected);
    if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
      return { valid: false, error: "Invalid hmac" };
    }

    const t = obj as unknown as PaymobTransactionObj;
    const orderId = t.order?.id;
    if (orderId === undefined || orderId === null) return { valid: false, error: "Missing order.id" };
    if (!Number.isInteger(t.amount_cents) || typeof t.currency !== "string") {
      return { valid: false, error: "Missing amount_cents / currency" };
    }

    return {
      valid: true,
      event: {
        gatewayOrderId: String(orderId),
        gatewayRef: t.id === undefined ? null : String(t.id),
        kind: deriveEventKind(t),
        success: t.success === true && t.pending !== true,
        amountMinor: t.amount_cents,
        currency: t.currency,
        integrationId: t.integration_id === undefined ? null : String(t.integration_id),
        parentRef: t.parent_transaction ? String(t.parent_transaction) : null,
        reason: t.data?.message ?? t.acq_response_code ?? null,
        occurredAt: t.created_at ? new Date(t.created_at) : null,
      },
    };
  },
};
