import { afterEach, describe, expect, it, vi } from "vitest";
import {
  trustedClientIp,
  checkRateLimit,
  __resetRateLimiterForTests,
} from "@/lib/rate-limit/token-bucket";

// M3 — trusted client IP + in-memory fallback (no Redis).

afterEach(() => {
  vi.unstubAllEnvs();
  __resetRateLimiterForTests();
});

const hdr = (map: Record<string, string>) => (n: string) => map[n.toLowerCase()];

describe("M3 — trustedClientIp (spoof-resistant)", () => {
  it("single trusted hop: a spoofed leftmost XFF cannot forge the key", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    // Attacker prepends '9.9.9.9'; the trusted proxy appends the real IP.
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
    // capacity 3, negligible refill: first 3 allowed, 4th denied.
    for (let i = 0; i < 4; i++) results.push(await checkRateLimit(key, 3, 1));
    expect(results).toEqual([true, true, true, false]);
  });
});
