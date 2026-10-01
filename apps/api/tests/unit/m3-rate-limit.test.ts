import { afterEach, describe, expect, it, vi } from "vitest";
import {
  trustedClientIp,
  checkRateLimit,
  rateLimitKey,
  rateLimiterDegraded,
  __resetRateLimiterForTests,
} from "@repo/server-core/rate-limit/token-bucket";

afterEach(() => {
  vi.unstubAllEnvs();
  __resetRateLimiterForTests();
});

const hdr = (map: Record<string, string>) => (n: string) => map[n.toLowerCase()];

describe("M3 — trustedClientIp (spoof-resistant)", () => {
  it("single trusted hop: a spoofed leftmost XFF cannot forge the key", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    const a = trustedClientIp(hdr({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" }));
    const b = trustedClientIp(hdr({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }));
    const c = trustedClientIp(hdr({ "x-forwarded-for": "203.0.113.7" }));
    expect(a).toBe("203.0.113.7"); // rightmost (trusted), not the spoof
    expect(b).toBe("203.0.113.7");
    expect(a).toBe(b); // rotating the spoofed leftmost yields the SAME key
    expect(c).toBe("203.0.113.7");
  });

  it("two trusted hops (e.g. Cloudflare + Nginx): takes the 2nd from the right", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    const ip = trustedClientIp(hdr({ "x-forwarded-for": "spoof, 203.0.113.7, 10.0.0.9" }));
    expect(ip).toBe("203.0.113.7");
  });

  it("verified platform header wins when configured", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "cf-connecting-ip");
    const ip = trustedClientIp(
      hdr({ "cf-connecting-ip": "198.51.100.42", "x-forwarded-for": "9.9.9.9, 10.0.0.9" }),
    );
    expect(ip).toBe("198.51.100.42");
  });

  it("on Vercel the platform header wins over a client-supplied XFF (L-12 follow-up)", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    // The attacker sends only what a client can send. If the edge forwards it
    // unchanged, XFF arithmetic reads the attacker's value; the platform header
    // is read first precisely so that it cannot.
    const a = trustedClientIp(
      hdr({ "x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": "9.9.9.9" }),
    );
    const b = trustedClientIp(
      hdr({ "x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": "6.6.6.6" }),
    );
    expect(a).toBe("203.0.113.7");
    expect(a).toBe(b); // rotating the forgeable header does not rotate the key
  });

  it("off Vercel the platform header is ignored — it proves nothing there", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    expect(
      trustedClientIp(hdr({ "x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": "9.9.9.9" })),
    ).toBe("9.9.9.9");
  });

  it("a configured header that is absent or junk does not fall through to a forgeable one", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "cf-connecting-ip");
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    expect(trustedClientIp(hdr({ "cf-connecting-ip": "203.0.113.7" }))).toBe("203.0.113.7");
    // absent -> XFF is still the documented last resort
    expect(trustedClientIp(hdr({ "x-forwarded-for": "198.51.100.4" }))).toBe("198.51.100.4");
  });

  it("only an IP is returned — the value reaches a Redis key and an audit column", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    expect(trustedClientIp(hdr({ "x-forwarded-for": "not-an-ip" }))).toBe("unknown");
    expect(trustedClientIp(hdr({ "x-forwarded-for": "<script>alert(1)</script>" }))).toBe("unknown");
    expect(trustedClientIp(hdr({ "x-forwarded-for": "999.1.1.1" }))).toBe("unknown");
    expect(trustedClientIp(hdr({ "x-forwarded-for": "x".repeat(5000) }))).toBe("unknown");
    // a port is stripped, not treated as a different client
    expect(trustedClientIp(hdr({ "x-forwarded-for": "203.0.113.7:51234" }))).toBe("203.0.113.7");
    expect(trustedClientIp(hdr({ "x-forwarded-for": "[2001:db8::1]:443" }))).toBe("2001:db8::1");
    expect(trustedClientIp(hdr({ "x-forwarded-for": "2001:DB8::1" }))).toBe("2001:db8::1");
  });

  it("an unparseable value at the TRUSTED position never falls back to an attacker-controlled one", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    expect(trustedClientIp(hdr({ "x-forwarded-for": "9.9.9.9, junk" }))).toBe("unknown");
  });

  it("no XFF -> 'unknown'", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    expect(trustedClientIp(hdr({}))).toBe("unknown");
  });
});

describe("M3 — in-memory fallback when REDIS_URL is unset (local dev)", () => {
  it("still enforces the bucket per process", async () => {
    vi.stubEnv("REDIS_URL", ""); // unset -> in-memory
    __resetRateLimiterForTests();
    const key = "m3-mem-" + Math.random().toString(36).slice(2);
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) results.push(await checkRateLimit(key, 3, 1));
    expect(results).toEqual([true, true, true, false]);
  });
});

describe("M3 — per-environment key namespace", () => {
  it("puts the environment in the key", () => {
    vi.stubEnv("EDURA_ENV", "production");
    expect(rateLimitKey("login-email:a@b.com")).toBe("rl:production:login-email:a@b.com");
  });

  it("dev and production never collide on the same logical key", () => {
    vi.stubEnv("EDURA_ENV", "dev");
    const dev = rateLimitKey("login-email:a@b.com");
    vi.stubEnv("EDURA_ENV", "production");
    const prod = rateLimitKey("login-email:a@b.com");
    expect(dev).not.toBe(prod);
  });

  it("falls back to NODE_ENV when EDURA_ENV is unset — a deployed app is 'production'", () => {
    vi.stubEnv("EDURA_ENV", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(rateLimitKey("k")).toBe("rl:production:k");
  });

  it("…and anything that is not a deployment is 'dev', so a laptop cannot reach production's buckets", () => {
    vi.stubEnv("EDURA_ENV", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(rateLimitKey("k")).toBe("rl:dev:k");
  });

  it("the buckets themselves are separate, not just the names", async () => {
    vi.stubEnv("REDIS_URL", ""); // in-memory path exercises the same namespacing
    __resetRateLimiterForTests();
    const key = "m3-ns-" + Math.random().toString(36).slice(2);

    vi.stubEnv("EDURA_ENV", "dev");
    expect(await checkRateLimit(key, 2, 1)).toBe(true);
    expect(await checkRateLimit(key, 2, 1)).toBe(true);
    expect(await checkRateLimit(key, 2, 1)).toBe(false);

    vi.stubEnv("EDURA_ENV", "production");
    expect(await checkRateLimit(key, 2, 1)).toBe(true);
  });
});

const DEAD_REDIS = "redis://127.0.0.1:6399";

describe("M3 — Redis outage must fail fast, and must still enforce", () => {
  it("bounds the wait, then serves from memory at no cost", async () => {
    vi.stubEnv("REDIS_URL", DEAD_REDIS);
    __resetRateLimiterForTests();
    const key = "m3-breaker-" + Math.random().toString(36).slice(2);

    for (let i = 0; i < 4; i++) await checkRateLimit(key, 100, 6000);
    expect(rateLimiterDegraded(), "breaker should be open after repeated failures").toBe(true);

    const t = Date.now();
    for (let i = 0; i < 10; i++) await checkRateLimit(key, 100, 6000);
    const elapsed = Date.now() - t;
    expect(elapsed, `10 degraded calls took ${elapsed}ms`).toBeLessThan(100);
  }, 30_000);

  it("still enforces the real login limit while degraded (5 allowed, then denied)", async () => {
    vi.stubEnv("REDIS_URL", DEAD_REDIS);
    __resetRateLimiterForTests();
    const key = "m3-degraded-" + Math.random().toString(36).slice(2);

    for (let i = 0; i < 4; i++) await checkRateLimit("warmup", 100, 6000);
    expect(rateLimiterDegraded()).toBe(true);

    const results: boolean[] = [];
    for (let i = 0; i < 7; i++) results.push(await checkRateLimit(key, 5, 5));
    expect(results).toEqual([true, true, true, true, true, false, false]);
  }, 30_000);

  it("reports degraded state, so an outage is observable rather than silent", async () => {
    vi.stubEnv("REDIS_URL", ""); // no Redis configured at all
    __resetRateLimiterForTests();
    await checkRateLimit("m3-nodegrade", 5, 5);
    expect(rateLimiterDegraded()).toBe(false);
  });
});
