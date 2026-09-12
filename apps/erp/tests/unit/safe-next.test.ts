import { describe, expect, it } from "vitest";
import { isSafeNext } from "@/lib/auth/safe-next";

// INJ-01: `?next=` must never leave the origin.
describe("isSafeNext", () => {
  it("accepts same-origin paths", () => {
    for (const v of ["/", "/ar/dashboard", "/en/p/elmaged?x=1#top", "/a/b/c"]) {
      expect(isSafeNext(v), v).toBe(true);
    }
  });

  it("rejects everything that would leave the origin", () => {
    for (const v of [
      "//evil.com",
      "/\\evil.com", // the reported payload, sent as /%5Cevil.com
      "/\\/evil.com",
      "/a\\evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "evil.com",
      "",
      null,
      undefined,
      "/" + "a".repeat(3000),
    ]) {
      expect(isSafeNext(v as string), String(v)).toBe(false);
    }
  });

  it("agrees with the URL parser about the origin", () => {
    // Whatever the check says "safe", resolving it must stay on the origin.
    const origin = "https://edura-erp.vercel.app";
    for (const v of ["/x", "/%5Cevil.com", "/\\evil.com", "//evil.com"]) {
      if (isSafeNext(v)) expect(new URL(v, origin).origin).toBe(origin);
    }
  });
});
