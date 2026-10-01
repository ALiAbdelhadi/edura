import { afterEach, describe, expect, it, vi } from "vitest";

const platformDb = vi.fn(async () => {
  throw new Error("platformDb must not be reached when the gate refuses");
});
vi.mock("@repo/server-core/db/scope", () => ({
  platformDb: (...a: unknown[]) => platformDb(...(a as [])),
  scopedDb: vi.fn(),
}));

const { onlineCheckoutAvailable } = await import("@repo/server-core/services/payments/gateway/index");
const { initiateWalletTopUpIntent } = await import("@repo/server-core/services/wallet/wallet-facade");
const { BusinessRuleError } = await import("@repo/server-core/errors/classes");

afterEach(() => {
  vi.unstubAllEnvs();
  platformDb.mockClear();
});

describe("onlineCheckoutAvailable — the one predicate", () => {
  it("production + mock → NOT available (the dead-button case)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENTS_MODE", "mock");
    expect(onlineCheckoutAvailable()).toBe(false);
  });

  it("production + live → available", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENTS_MODE", "live");
    expect(onlineCheckoutAvailable()).toBe(true);
  });

  it("development + mock → available (the local mock-complete loop works)", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PAYMENTS_MODE", "mock");
    expect(onlineCheckoutAvailable()).toBe(true);
  });
});

describe("the initiators assert the same predicate", () => {
  it("wallet top-up refuses in production+mock BEFORE touching the database", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENTS_MODE", "mock");
    await expect(
      initiateWalletTopUpIntent(
        { amount: 5000, method: "card", idempotencyKey: "gate-test-0001" },
        { id: "s1", role: "student" } as never,
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(platformDb).not.toHaveBeenCalled();
  });
});
