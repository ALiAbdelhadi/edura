import { describe, expect, it } from "vitest";
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

  it("leaves development alone — the in-memory fallback stays usable", () => {
    expect(() => assertSharedRateLimitStore({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => assertSharedRateLimitStore({} as NodeJS.ProcessEnv)).not.toThrow();
  });
});
