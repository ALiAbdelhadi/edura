import { describe, expect, it, vi } from "vitest";
import { assertSharedRateLimitStore } from "@repo/server-core/rate-limit/require-shared-store";

const prod = (extra: Record<string, string | undefined> = {}) =>
  ({ NODE_ENV: "production", ...extra }) as NodeJS.ProcessEnv;

describe("M-C — production requires a shared rate-limit store", () => {
  it("refuses to boot in production with no REDIS_URL", () => {
    expect(() => assertSharedRateLimitStore(prod())).toThrow(/REDIS_URL is required in production/);
  });

  it("refuses an empty or whitespace REDIS_URL", () => {
    expect(() => assertSharedRateLimitStore(prod({ REDIS_URL: "   " }))).toThrow(/required in production/);
  });

  it("accepts a TLS redis URL", () => {
    expect(() => assertSharedRateLimitStore(prod({ REDIS_URL: "rediss://user:pw@host:6379" }))).not.toThrow();
  });

  it("refuses plaintext redis:// unless it is explicitly accepted", () => {
    expect(() => assertSharedRateLimitStore(prod({ REDIS_URL: "redis://host:6379" }))).toThrow(/plaintext/);
    expect(() =>
      assertSharedRateLimitStore(prod({ REDIS_URL: "redis://host:6379", ALLOW_PLAINTEXT_REDIS: "1" })),
    ).not.toThrow();
  });

  it("refuses a URL that is not redis at all", () => {
    expect(() => assertSharedRateLimitStore(prod({ REDIS_URL: "http://host:6379" }))).toThrow(/redis:\/\/ or rediss:\/\//);
  });

  it("L-11: ALLOW_UNSHARED_RATE_LIMIT=1 is a real escape hatch — boots without Redis, loudly", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() => assertSharedRateLimitStore(prod({ ALLOW_UNSHARED_RATE_LIMIT: "1" }))).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/ALLOW_UNSHARED_RATE_LIMIT=1/));
    warn.mockRestore();
    expect(() => assertSharedRateLimitStore(prod({ ALLOW_UNSHARED_RATE_LIMIT: "yes" }))).toThrow(/REDIS_URL is required/);
  });

  it("L-12: on Vercel, production must say how the client IP is read", () => {
    const base = { REDIS_URL: "rediss://example.invalid:6380", VERCEL: "1" };
    expect(() => assertSharedRateLimitStore(prod(base))).toThrow(/TRUSTED_CLIENT_IP_HEADER=x-vercel-forwarded-for/);
    expect(() => assertSharedRateLimitStore(prod({ ...base, TRUSTED_CLIENT_IP_HEADER: "x-vercel-forwarded-for" }))).not.toThrow();
    expect(() => assertSharedRateLimitStore(prod({ ...base, TRUSTED_PROXY_HOPS: "2" }))).not.toThrow();
    // off Vercel the hop count default is fine
    expect(() => assertSharedRateLimitStore(prod({ REDIS_URL: "rediss://example.invalid:6380" }))).not.toThrow();
  });

  it("leaves development alone — the in-memory fallback stays usable", () => {
    expect(() => assertSharedRateLimitStore({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => assertSharedRateLimitStore({} as NodeJS.ProcessEnv)).not.toThrow();
  });
});
