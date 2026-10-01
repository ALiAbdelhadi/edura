// SECURITY_AUDIT.md H-04 — the webhook contract carries amount, currency, kind
// and integration id, and both drivers fill it from the provider's own fields.
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PAYMOB_HMAC_FIELDS,
  paymobDriver,
  paymobTransactionHmac,
} from "@repo/server-core/services/payments/gateway/paymob-driver";
import { mockDriver, signMockWebhook } from "@repo/server-core/services/payments/gateway/mock-driver";
import { deriveEventKind, integrationAllowed } from "@repo/server-core/services/payments/gateway/types";

const SECRET = "unit-test-hmac-secret";

function paymobObj(over: Record<string, unknown> = {}) {
  return {
    id: 987654,
    amount_cents: 40000,
    currency: "EGP",
    success: true,
    pending: false,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_voided: false,
    is_standalone_payment: true,
    is_3d_secure: true,
    error_occured: false,
    has_parent_transaction: false,
    integration_id: 12345,
    created_at: "2026-09-06T10:00:00.000Z",
    owner: 42,
    order: { id: 555, merchant_order_id: "intent-1" },
    source_data: { pan: "2346", sub_type: "MasterCard", type: "card" },
    data: { message: "Approved" },
    ...over,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("H-04 — kind derivation from provider flags", () => {
  it("only a plain success is a capture", () => {
    expect(deriveEventKind({ success: true })).toBe("capture");
    expect(deriveEventKind({ success: true, is_capture: true })).toBe("capture");
  });
  it("reversal and pending flags win over success", () => {
    expect(deriveEventKind({ success: true, is_refunded: true })).toBe("refund");
    expect(deriveEventKind({ success: true, is_voided: true })).toBe("void");
    // WEBHOOK-01: the delivered reversal object describes ITSELF with
    // is_refund / is_void; the parent's is_refunded / is_voided may be absent.
    expect(deriveEventKind({ success: true, is_refund: true })).toBe("refund");
    expect(deriveEventKind({ success: true, is_void: true })).toBe("void");
    // …but a parent reference alone is not a reversal (capture-after-auth carries one).
    expect(deriveEventKind({ success: true, is_capture: true, is_refund: false })).toBe("capture");
    expect(deriveEventKind({ success: true, pending: true })).toBe("pending");
    expect(deriveEventKind({ success: true, is_auth: true })).toBe("auth");
  });
  it("a declined transaction is failed", () => {
    expect(deriveEventKind({ success: false })).toBe("failed");
  });
});

describe("H-04 — Paymob driver verifies the real HMAC and maps the fields", () => {
  it("signs the 20 documented fields in lexicographic order", () => {
    expect([...PAYMOB_HMAC_FIELDS]).toEqual([...PAYMOB_HMAC_FIELDS].sort());
    expect(PAYMOB_HMAC_FIELDS).toHaveLength(20);
    const obj = paymobObj();
    const material =
      "40000" + "2026-09-06T10:00:00.000Z" + "EGP" + "false" + "false" + "987654" + "12345" +
      "true" + "false" + "false" + "false" + "true" + "false" + "555" + "42" + "false" +
      "2346" + "MasterCard" + "card" + "true";
    const expected = createHmac("sha512", SECRET).update(material).digest("hex");
    expect(paymobTransactionHmac(obj, SECRET)).toBe(expected);
  });

  it("accepts a correctly signed TRANSACTION callback and fills the contract", () => {
    vi.stubEnv("PAYMOB_HMAC_SECRET", SECRET);
    const obj = paymobObj();
    const body = JSON.stringify({ type: "TRANSACTION", obj });
    const res = paymobDriver.verifyWebhook(body, { hmac: paymobTransactionHmac(obj, SECRET) });
    expect(res.valid).toBe(true);
    if (!res.valid) return;
    expect(res.event).toMatchObject({
      gatewayOrderId: "555",
      gatewayRef: "987654",
      kind: "capture",
      success: true,
      amountMinor: 40000,
      currency: "EGP",
      integrationId: "12345",
      parentRef: null,
      reason: "Approved",
    });
    expect(res.event.occurredAt?.toISOString()).toBe("2026-09-06T10:00:00.000Z");
  });

  it("rejects a tampered amount — the HMAC covers it", () => {
    vi.stubEnv("PAYMOB_HMAC_SECRET", SECRET);
    const obj = paymobObj();
    const hmac = paymobTransactionHmac(obj, SECRET);
    const tampered = JSON.stringify({ type: "TRANSACTION", obj: { ...obj, amount_cents: 1 } });
    expect(paymobDriver.verifyWebhook(tampered, { hmac })).toMatchObject({ valid: false, error: "Invalid hmac" });
  });

  it("rejects a missing or wrong-length hmac without throwing", () => {
    vi.stubEnv("PAYMOB_HMAC_SECRET", SECRET);
    const body = JSON.stringify({ type: "TRANSACTION", obj: paymobObj() });
    expect(paymobDriver.verifyWebhook(body, {})).toMatchObject({ valid: false });
    expect(paymobDriver.verifyWebhook(body, { hmac: "abc" })).toMatchObject({ valid: false });
  });

  it("maps a refund callback to kind=refund with its parent capture", () => {
    vi.stubEnv("PAYMOB_HMAC_SECRET", SECRET);
    const obj = paymobObj({ id: 111, is_refunded: true, has_parent_transaction: true, parent_transaction: 987654, amount_cents: 15000 });
    const body = JSON.stringify({ type: "TRANSACTION", obj });
    const res = paymobDriver.verifyWebhook(body, { hmac: paymobTransactionHmac(obj, SECRET) });
    expect(res.valid && res.event).toMatchObject({ kind: "refund", parentRef: "987654", amountMinor: 15000 });
  });

  it("ignores (200, not 401) non-transaction callback types", () => {
    vi.stubEnv("PAYMOB_HMAC_SECRET", SECRET);
    const res = paymobDriver.verifyWebhook(JSON.stringify({ type: "TOKEN", obj: {} }), { hmac: "x" });
    expect(res).toMatchObject({ valid: false, ignore: true });
  });

  it("refuses to run without PAYMOB_HMAC_SECRET", () => {
    vi.stubEnv("PAYMOB_HMAC_SECRET", "");
    const body = JSON.stringify({ type: "TRANSACTION", obj: paymobObj() });
    expect(() => paymobDriver.verifyWebhook(body, { hmac: "x" })).toThrow(/PAYMOB_HMAC_SECRET/);
  });
});

describe("H-04 — mock driver carries the same fields", () => {
  it("requires amount_cents and currency", () => {
    vi.stubEnv("NODE_ENV", "development");
    const body = JSON.stringify({ gateway_order_id: "mock_1", success: true });
    expect(mockDriver.verifyWebhook(body, { hmac: signMockWebhook(body) })).toMatchObject({ valid: false, error: "Missing amount_cents / currency" });
  });
  it("fills the contract", () => {
    vi.stubEnv("NODE_ENV", "development");
    const body = JSON.stringify({ gateway_order_id: "mock_1", success: true, amount_cents: 500, currency: "EGP", integration_id: "7" });
    const res = mockDriver.verifyWebhook(body, { hmac: signMockWebhook(body) });
    expect(res.valid && res.event).toMatchObject({ kind: "capture", amountMinor: 500, currency: "EGP", integrationId: "7" });
  });
});

describe("H-04 — integration allow-list fails closed outside mock mode", () => {
  it("mock mode with no list allows anything", () => {
    vi.stubEnv("PAYMENTS_MODE", "mock");
    vi.stubEnv("PAYMOB_INTEGRATION_IDS", "");
    expect(integrationAllowed(null)).toBe(true);
    expect(integrationAllowed("9")).toBe(true);
  });
  it("live mode with no list refuses every integration", () => {
    vi.stubEnv("PAYMENTS_MODE", "live");
    vi.stubEnv("PAYMOB_INTEGRATION_IDS", "");
    expect(integrationAllowed("9")).toBe(false);
    expect(integrationAllowed(null)).toBe(false);
  });
  it("a list is honoured exactly, in any mode", () => {
    vi.stubEnv("PAYMENTS_MODE", "mock");
    vi.stubEnv("PAYMOB_INTEGRATION_IDS", "12345, 678");
    expect(integrationAllowed("12345")).toBe(true);
    expect(integrationAllowed("678")).toBe(true);
    expect(integrationAllowed("9")).toBe(false);
    expect(integrationAllowed(null)).toBe(false);
  });
});
