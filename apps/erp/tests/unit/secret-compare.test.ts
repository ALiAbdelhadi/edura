import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { secretEquals, bearerEquals } from "@repo/server-core/auth/secret-compare";

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
      expect(src, `${name} must not compare a secret with === / !==`).not.toMatch(
        /(x-(cron|internal)-secret[^\n]*|internalSecret|CRON_SECRET)\s*[!=]==/,
      );
    });
  }
});
