import { afterEach, describe, expect, it, vi } from "vitest";
import { paymentsMode } from "@/lib/services/payments/gateway/types";
import { mockHmacSecret, mockDriver, signMockWebhook } from "@/lib/services/payments/gateway/mock-driver";
import { resolveDriver } from "@/lib/services/payments/gateway";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("C1 — paymentsMode() production guard", () => {
  it("dev with no PAYMENTS_MODE defaults to mock", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PAYMENTS_MODE", "");
    expect(paymentsMode()).toBe("mock");
  });

  it("PRODUCTION with no PAYMENTS_MODE hard-fails (no silent mock default)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENTS_MODE", "");
    expect(() => paymentsMode()).toThrow(/must be explicitly set in production/);
  });

  it("PRODUCTION with an invalid PAYMENTS_MODE hard-fails (no downgrade to mock)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENTS_MODE", "bogus");
    expect(() => paymentsMode()).toThrow(/Invalid PAYMENTS_MODE/);
  });

  it("PRODUCTION honours an explicit live/sandbox/mock", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENTS_MODE", "live");
    expect(paymentsMode()).toBe("live");
    vi.stubEnv("PAYMENTS_MODE", "sandbox");
    expect(paymentsMode()).toBe("sandbox");
    vi.stubEnv("PAYMENTS_MODE", "mock");
    expect(paymentsMode()).toBe("mock");
  });
});

describe("C1 — mockHmacSecret() has no production fallback", () => {
  it("dev falls back to the local mock secret", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PAYMOB_HMAC_SECRET", "");
    expect(mockHmacSecret()).toBe("edura-mock-hmac");
  });

  it("PRODUCTION with no PAYMOB_HMAC_SECRET hard-fails (public key can't sign)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMOB_HMAC_SECRET", "");
    expect(() => mockHmacSecret()).toThrow(/PAYMOB_HMAC_SECRET is required in production/);
  });

  it("PRODUCTION uses the real secret when provided", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMOB_HMAC_SECRET", "real-secret-123");
    expect(mockHmacSecret()).toBe("real-secret-123");
  });
});

describe("C1 — verifyWebhook constant-time HMAC compare", () => {
  const body = JSON.stringify({ gateway_order_id: "mock_x", success: true, amount_cents: 1000, currency: "EGP" });

  it("accepts a correctly-signed body", () => {
    vi.stubEnv("NODE_ENV", "development");
    const hmac = signMockWebhook(body);
    const res = mockDriver.verifyWebhook(body, { hmac });
    expect(res.valid).toBe(true);
  });

  it("rejects a wrong-length hmac without throwing (length-guarded timingSafeEqual)", () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = mockDriver.verifyWebhook(body, { hmac: "short" });
    expect(res.valid).toBe(false);
  });

  it("rejects a same-length-but-wrong hmac", () => {
    vi.stubEnv("NODE_ENV", "development");
    const expected = signMockWebhook(body);
    const wrong = "f".repeat(expected.length);
    const res = mockDriver.verifyWebhook(body, { hmac: wrong });
    expect(res.valid).toBe(false);
  });
});

describe("M-07 — the mock driver cannot exist in production", () => {
  it("dev resolves the mock driver", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PAYMENTS_MODE", "mock");
    expect(resolveDriver().name).toBe("mock");
  });
  it("PRODUCTION with PAYMENTS_MODE=mock throws instead of returning the mock driver", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENTS_MODE", "mock");
    expect(() => resolveDriver()).toThrow(/PAYMENTS_MODE=mock is not allowed in production/);
  });
  it("PRODUCTION with live resolves paymob", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENTS_MODE", "live");
    expect(resolveDriver().name).toBe("paymob");
  });
  it("a CORRECTLY signed mock body is refused in production regardless of how the driver was reached", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMOB_HMAC_SECRET", "real-secret-123");
    const body = JSON.stringify({ gateway_order_id: "mock_x", success: true, amount_cents: 1000, currency: "EGP" });
    const hmac = signMockWebhook(body);
    expect(mockDriver.verifyWebhook(body, { hmac })).toMatchObject({ valid: false, error: /disabled in production/ });
  });
});

describe("C1 — mock-complete route is 404 in production", () => {
  it.skipIf(!process.env.DATABASE_URL)("returns HTTP 404 under a simulated production env (before any auth)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await import(
      "@/app/api/v1/payments/intents/[id]/mock-complete/route"
    );
    const req = new Request("http://localhost/api/v1/payments/intents/abc/mock-complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outcome: "success" }),
    });
    const res = await POST(req as any, { params: Promise.resolve({ id: "abc" }) } as any);
    expect(res.status).toBe(404);
  });
});
