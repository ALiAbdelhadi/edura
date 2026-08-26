// M-1 drift test — the login doors must throttle PER ACCOUNT, not only per IP.
//
// The finding (QA/01-findings.md, M-1) had two halves and they are separate
// failures:
//
//   1. Per-IP limiting alone cannot stop a credential-stuffing run against ONE
//      account: the attacker rotates source addresses and every attempt lands
//      in a fresh bucket. The fix is a second bucket keyed on the email, so the
//      budget follows the account being attacked rather than the machine
//      attacking it.
//   2. The IP itself was taken from the leftmost `X-Forwarded-For` entry, which
//      the client supplies — so even the per-IP bucket was forgeable by sending
//      a different first hop each time. The fix is `trustedClientIp`, which
//      counts hops from the RIGHT (see tests/unit/m3-rate-limit.test.ts for the
//      resolver's own proofs).
//
// This is the STRUCTURAL half — the same technique as
// tests/unit/c04-login-allowlist.test.ts and the L-4 half of
// tests/unit/secret-compare.test.ts: the property lives in the shape of the
// door, so it is asserted against the door's source. A behavioural half over a
// real better-auth instance would need a live DB and a real bcrypt round per
// attempt; the primitive it would exercise is already proven end-to-end in
// m3-rate-limit.test.ts, and what actually rots here is the WIRING.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkRateLimit, rateLimitKey, __resetRateLimiterForTests } from "@/lib/rate-limit/token-bucket";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const DOORS = [
  ["www", read("../../src/lib/auth/auth.ts")],
  ["superadmin", read("../../../superadmin/src/lib/auth/auth.ts")],
] as const;

describe.each(DOORS)("M-1 — the %s login door is throttled per account", (name, src) => {
  it("keys a bucket on the email, not only on the IP", () => {
    expect(src, `${name} must key a bucket on the account`).toMatch(/`login-email:\$\{email\}`/);
    expect(src, `${name} must still key a bucket on the caller`).toMatch(/`login-ip:\$\{ip\}`/);
  });

  it("takes the IP from trustedClientIp, never from a raw X-Forwarded-For read", () => {
    expect(src).toMatch(/trustedClientIp/);
    // A door that parsed the header itself would be taking the leftmost,
    // client-supplied hop again — the exact bypass M-1 records.
    expect(src, `${name} must not read x-forwarded-for directly`).not.toMatch(/x-forwarded-for/i);
  });

  it("normalises the email before keying, so case rotation cannot mint fresh buckets", () => {
    // `Ali@x.com` and `ali@x.com` are the same account to Postgres' lookup;
    // if they were different bucket keys the per-account cap would be a
    // formality — an attacker gets a new budget per capitalisation.
    expect(src).toMatch(/email\?\.toLowerCase\(\)\.trim\(\)/);
  });

  it("spends the budget BEFORE the user lookup and the password compare", () => {
    // Throttling after the DB round-trip and bcrypt is throttling that still
    // pays for every attempt — and leaves the timing oracle H5 closed.
    const emailBucket = src.indexOf("`login-email:${email}`");
    const lookup = src.search(/prisma\.user\.find/);
    const compare = src.search(/await verifyPassword\(/);
    expect(emailBucket).toBeGreaterThan(-1);
    expect(lookup, `${name}: expected a user lookup in the hook`).toBeGreaterThan(-1);
    expect(emailBucket).toBeLessThan(lookup);
    if (compare > -1) expect(emailBucket).toBeLessThan(compare);
  });

  it("caps the per-account budget tightly (a bump to a useless number is a regression)", () => {
    const cap = /const LOGIN_EMAIL_CAP = (\d+);/.exec(src);
    expect(cap, `${name} must declare LOGIN_EMAIL_CAP`).not.toBeNull();
    expect(Number(cap![1])).toBeLessThanOrEqual(10);
    const rate = /const LOGIN_EMAIL_RATE = (\d+);/.exec(src);
    expect(rate, `${name} must declare LOGIN_EMAIL_RATE`).not.toBeNull();
    expect(Number(rate![1])).toBeLessThanOrEqual(10);
  });
});

describe("M-1 — the account bucket survives an IP-rotating attacker", () => {
  it("one email exhausts one budget however many addresses it arrives from", async () => {
    __resetRateLimiterForTests();
    const email = `m1-${Math.random().toString(36).slice(2)}@edura.test`;
    // Each attempt "comes from" a different address; only the account key is
    // consulted here, which is precisely why the per-IP bucket cannot save it.
    const results: boolean[] = [];
    for (let i = 0; i < 7; i++) results.push(await checkRateLimit(`login-email:${email}`, 5, 5));
    expect(results).toEqual([true, true, true, true, true, false, false]);
  });

  it("two accounts do not share a budget — one victim cannot lock out the rest", async () => {
    __resetRateLimiterForTests();
    const a = `m1-a-${Math.random().toString(36).slice(2)}@edura.test`;
    const b = `m1-b-${Math.random().toString(36).slice(2)}@edura.test`;
    for (let i = 0; i < 5; i++) await checkRateLimit(`login-email:${a}`, 5, 5);
    expect(await checkRateLimit(`login-email:${a}`, 5, 5)).toBe(false);
    expect(await checkRateLimit(`login-email:${b}`, 5, 5)).toBe(true);
  });

  it("the account key is namespaced per environment like every other bucket", () => {
    expect(rateLimitKey("login-email:a@b.com")).toMatch(/^rl:[^:]+:login-email:a@b\.com$/);
  });
});
