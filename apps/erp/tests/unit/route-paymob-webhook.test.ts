import { describe, expect, it, vi, beforeEach } from "vitest";

// The gateway webhook is unauthenticated by nature — the HMAC over the RAW
// body is the credential (c1-payments-mode.test.ts proves the constant-time
// compare itself). This file pins the ROUTE's contract around it: a failed
// verification never reaches settlement, an unknown order returns 200 so the
// gateway stops retrying, and the response carries the intent id on success.

const verifyWebhook = vi.fn();
const processWebhookEvent = vi.fn();
vi.mock("@/lib/services/payments/gateway", () => ({
  resolveDriver: () => ({ verifyWebhook }),
}));
vi.mock("@/lib/services/payments/payment-intents", () => ({
  processWebhookEvent: (...args: unknown[]) => processWebhookEvent(...(args as [])),
}));
vi.mock("@/lib/rate-limit/middleware", () => ({
  withRateLimit: (h: unknown) => h,
}));

const { POST } = await import("@/app/api/v1/payments/paymob/webhook/route");

function hit(body: string, qs = "?hmac=abc") {
  return POST(
    new Request(`http://t.local/api/v1/payments/paymob/webhook${qs}`, {
      method: "POST",
      body,
    }),
    { params: Promise.resolve({}) },
  );
}

beforeEach(() => {
  verifyWebhook.mockReset();
  processWebhookEvent.mockReset();
});

describe("POST /api/v1/payments/paymob/webhook", () => {
  it("invalid signature → 401 invalid_signature, settlement never runs", async () => {
    verifyWebhook.mockReturnValue({ valid: false, error: "hmac mismatch" });
    const res = await hit(JSON.stringify({ obj: { id: 1 } }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "invalid_signature",
    );
    expect(processWebhookEvent).not.toHaveBeenCalled();
  });

  it("valid signature → settles and returns the intent id", async () => {
    verifyWebhook.mockReturnValue({ valid: true, event: { orderId: "o-1", success: true } });
    processWebhookEvent.mockResolvedValue({ handled: true, intentId: "pi-1", result: "settled" });
    const res = await hit(JSON.stringify({ obj: { id: 1 } }));
    expect(res.status).toBe(200);
    expect((await res.json()) as object).toEqual({
      data: { intentId: "pi-1", result: "settled" },
    });
    // The event passed to settlement is the DRIVER's verified event — never
    // re-derived from the raw payload.
    expect(processWebhookEvent).toHaveBeenCalledWith(
      { orderId: "o-1", success: true },
      { obj: { id: 1 } },
    );
  });

  it("unknown order id → 200 with ignored:true so the gateway stops retrying", async () => {
    verifyWebhook.mockReturnValue({ valid: true, event: { orderId: "ghost" } });
    processWebhookEvent.mockResolvedValue({ handled: false, reason: "no matching intent" });
    const res = await hit(JSON.stringify({ obj: {} }));
    expect(res.status).toBe(200);
    expect((await res.json()) as object).toEqual({
      data: { ignored: true, reason: "no matching intent" },
    });
  });

  it("non-JSON raw body still verifies and settles (raw fallback payload)", async () => {
    verifyWebhook.mockReturnValue({ valid: true, event: { orderId: "o-2" } });
    processWebhookEvent.mockResolvedValue({ handled: true, intentId: "pi-2", result: "settled" });
    const res = await hit("not-json-at-all");
    expect(res.status).toBe(200);
    expect(processWebhookEvent).toHaveBeenCalledWith(
      { orderId: "o-2" },
      { raw: "not-json-at-all" },
    );
  });
});
