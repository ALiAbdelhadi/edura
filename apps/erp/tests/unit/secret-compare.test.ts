import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { secretEquals, bearerEquals } from "@repo/server-core/auth/secret-compare";

/**
 * L-4 — the three server-to-server doors (cron, internal chat-notify, and the
 * realtime server's end of that bridge) authenticated with `===`/`!==` against
 * an env secret. String equality short-circuits at the first differing byte, so
 * failure time leaked how much of the secret a caller had guessed.
 *
 * These assert the helper's SEMANTICS, which is what a future edit is likely to
 * break. Timing itself is not asserted: a wall-clock comparison in a unit test
 * is noise on a shared runner, and the guarantee comes from `timingSafeEqual`
 * over two equal-length SHA-256 digests, which is structural.
 */
describe("secretEquals", () => {
  const SECRET = "s3cr3t-value-with-some-length";

  it("accepts an exact match", () => {
    expect(secretEquals(SECRET, SECRET)).toBe(true);
  });

  it("rejects a wrong value of the same length", () => {
    expect(secretEquals("s3cr3t-value-with-some-lengtH", SECRET)).toBe(false);
  });

  it("rejects a value that only shares a prefix — the byte-at-a-time oracle", () => {
    expect(secretEquals("s3cr3t-value-with-some-lengt", SECRET)).toBe(false);
    expect(secretEquals("s", SECRET)).toBe(false);
  });

  it("rejects a longer value that starts with the secret", () => {
    expect(secretEquals(SECRET + "x", SECRET)).toBe(false);
  });

  // An absent header must never authenticate, and an unset secret must never
  // make every caller valid — the failure mode that would turn a fail-closed
  // door into an open one.
  it("rejects null, undefined and empty on either side", () => {
    expect(secretEquals(null, SECRET)).toBe(false);
    expect(secretEquals(undefined, SECRET)).toBe(false);
    expect(secretEquals("", SECRET)).toBe(false);
    expect(secretEquals(SECRET, undefined)).toBe(false);
    expect(secretEquals(SECRET, "")).toBe(false);
    expect(secretEquals(undefined, undefined)).toBe(false);
    expect(secretEquals("", "")).toBe(false);
  });

  it("does not throw on unequal lengths (hashing equalises them)", () => {
    expect(() => secretEquals("a", "a-much-longer-secret-value")).not.toThrow();
  });
});

describe("bearerEquals", () => {
  const SECRET = "cron-secret-value";

  it("accepts a correct Bearer token", () => {
    expect(bearerEquals(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("rejects a wrong token, a missing scheme, and the bare secret", () => {
    expect(bearerEquals("Bearer wrong", SECRET)).toBe(false);
    expect(bearerEquals(SECRET, SECRET)).toBe(false);
    expect(bearerEquals(`bearer ${SECRET}`, SECRET)).toBe(false); // scheme is case-sensitive here
  });

  it("rejects null, undefined and an empty token", () => {
    expect(bearerEquals(null, SECRET)).toBe(false);
    expect(bearerEquals(undefined, SECRET)).toBe(false);
    expect(bearerEquals("Bearer ", SECRET)).toBe(false);
  });
});

/**
 * The STRUCTURAL half. The tests above assert semantics, and plain `===` would
 * satisfy most of them — which is exactly the regression this finding is about.
 * Constant-timeness cannot be measured reliably on a shared runner, so it is
 * asserted where it actually lives: in the source. Same technique the C-04
 * login-door test uses (tests/unit/c04-login-allowlist.test.ts).
 */
describe("L-4 — the doors compare secrets in constant time", () => {
  const read = (rel: string) =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

  const HELPER = read("../../../../packages/server-core/src/auth/secret-compare.ts");
  const CRON = read("../../src/app/api/v1/cron/[job]/route.ts");
  const CHAT_NOTIFY = read("../../src/app/api/v1/internal/chat-notify/route.ts");
  const REALTIME = read("../../../realtime/src/internal.ts");

  it("the helper uses timingSafeEqual over equal-length digests", () => {
    expect(HELPER).toMatch(/timingSafeEqual/);
    expect(HELPER).toMatch(/createHash\("sha256"\)/);
  });

  for (const [name, src] of [
    ["cron", CRON],
    ["chat-notify", CHAT_NOTIFY],
    ["realtime internal", REALTIME],
  ] as const) {
    it(`${name} routes its secret through the shared helper, not raw equality`, () => {
      expect(src, `${name} must import the shared helper`).toMatch(/secret-compare/);
      // No raw comparison of a secret-bearing value.
      expect(src, `${name} must not compare a secret with === / !==`).not.toMatch(
        /(x-(cron|internal)-secret[^\n]*|internalSecret|CRON_SECRET)\s*[!=]==/,
      );
    });
  }
});
