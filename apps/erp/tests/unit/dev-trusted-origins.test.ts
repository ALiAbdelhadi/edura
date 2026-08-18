// Proof for the dev-only localhost origin allowance.
//
// better-auth 403s any request whose `Origin` is not trusted. Both apps used
// to satisfy that with a hand-written list of preview ports copied out of
// `.claude/launch.json`; the copy drifted, and a preview on an unlisted port
// returned 403 on a sign-in with entirely valid credentials — which reads as
// "the demo accounts are broken", not "this port is not on a list".
//
// The list is gone. What has to stay true is the boundary: this widens
// development ONLY, and it may never trust a host that merely *looks* like
// localhost.
import { afterEach, describe, expect, it, vi } from "vitest";
import { devLocalhostOrigins } from "@repo/server-core/auth/dev-origins";

afterEach(() => {
  vi.unstubAllEnvs();
});

/** better-auth's rule: a pattern with `*` and `://` is globbed against the origin. */
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
    // Every preview port in .claude/launch.json, plus the one that exposed the
    // drift (3058) and an arbitrary future one.
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

    // The wildcard is host-anchored. A hostname that merely starts with or
    // contains "localhost" is a DIFFERENT host and must not match.
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
