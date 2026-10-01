import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkRateLimit, rateLimitKey, __resetRateLimiterForTests } from "@repo/server-core/rate-limit/token-bucket";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const DOORS = [
  ["www", read("../../../../packages/server-core/src/erp-auth/create-auth.ts")],
  ["superadmin", read("../../../../packages/server-core/src/backoffice-auth/create-auth.ts")],
] as const;

describe.each(DOORS)("M-1 — the %s login door is throttled per account", (name, src) => {
  it("keys a bucket on the email, not only on the IP", () => {
    expect(src, `${name} must key a bucket on the account`).toMatch(/`login-email:\$\{email\}`/);
    expect(src, `${name} must still key a bucket on the caller`).toMatch(/`login-ip:\$\{ip\}`/);
  });

  it("takes the IP from trustedClientIp, never from a raw X-Forwarded-For read", () => {
    expect(src).toMatch(/trustedClientIp/);
    expect(src, `${name} must not read x-forwarded-for directly`).not.toMatch(/x-forwarded-for/i);
  });

  it("normalises the email before keying, so case rotation cannot mint fresh buckets", () => {
    expect(src).toMatch(/email\?\.toLowerCase\(\)\.trim\(\)/);
  });

  it("spends the budget BEFORE the user lookup and the password compare", () => {
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
