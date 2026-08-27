import { afterEach, describe, expect, it, vi } from "vitest";
import { devLocalhostOrigins } from "@repo/server-core/auth/dev-origins";

afterEach(() => {
  vi.unstubAllEnvs();
});

function matches(patterns: string[], origin: string): boolean {
  return patterns.some((p) => {
    const rx = new RegExp(
      `^${p.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`,
    );
    return rx.test(origin);
  });
}

describe("devLocalhostOrigins", () => {
  it("is EMPTY in production — baseURL stays the only trusted origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(devLocalhostOrigins()).toEqual([]);
  });

  it.each(["development", "test"])("is non-empty in %s", (env) => {
    vi.stubEnv("NODE_ENV", env);
    expect(devLocalhostOrigins().length).toBeGreaterThan(0);
  });

  describe("in development", () => {
    it.each([
      "http://localhost:3002",
      "http://localhost:3004",
      "http://localhost:3021",
      "http://localhost:3037",
      "http://localhost:3042",
      "http://localhost:3058",
      "http://localhost:9999",
      "http://127.0.0.1:3058",
      "http://localhost",
    ])("trusts %s", (origin) => {
      vi.stubEnv("NODE_ENV", "development");
      expect(matches(devLocalhostOrigins(), origin)).toBe(true);
    });

    it.each([
      "http://localhost.evil.com",
      "http://localhost.evil.com:3058",
      "http://notlocalhost:3058",
      "http://evil.com/localhost",
      "https://localhost:3058", // scheme is part of the pattern
      "http://127.0.0.1.evil.com",
      "http://example.com",
    ])("does NOT trust %s", (origin) => {
      vi.stubEnv("NODE_ENV", "development");
      expect(matches(devLocalhostOrigins(), origin)).toBe(false);
    });
  });

  it("never names a non-localhost host in any environment", () => {
    for (const env of ["development", "test", "production"]) {
      vi.stubEnv("NODE_ENV", env);
      for (const p of devLocalhostOrigins()) {
        expect(p).toMatch(/^http:\/\/(localhost|127\.0\.0\.1)(:\*)?$/);
      }
    }
  });
});
