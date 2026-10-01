import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  devScopedCookiePrefix,
  isSessionAmbiguous,
  presentedSessionTokenIds,
  presentedSessionTokens,
  sessionCookieNames,
  sessionTokenId,
} from "@repo/server-core/auth/session-cookies";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_PORT = process.env.PORT;
const ORIGINAL_COOKIE_PORT = process.env.EDURA_DEV_COOKIE_PORT;

// Assigning undefined to process.env stores the string "undefined"; an absent
// variable has to be deleted.
function setVar(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function setEnv(nodeEnv: string | undefined, port: string | undefined, cookiePort?: string) {
  setVar("NODE_ENV", nodeEnv);
  setVar("PORT", port);
  setVar("EDURA_DEV_COOKIE_PORT", cookiePort);
}

beforeEach(() => setEnv(ORIGINAL_NODE_ENV, ORIGINAL_PORT, ORIGINAL_COOKIE_PORT));
afterEach(() => setEnv(ORIGINAL_NODE_ENV, ORIGINAL_PORT, ORIGINAL_COOKIE_PORT));

describe("devScopedCookiePrefix", () => {
  it("appends the dev server's port so parallel dev servers cannot share a jar", () => {
    setEnv("development", "3042");
    expect(devScopedCookiePrefix("edura")).toBe("edura-3042");
    expect(devScopedCookiePrefix("edura-superadmin")).toBe("edura-superadmin-3042");
  });

  it("gives two dev servers DIFFERENT names — the whole point", () => {
    setEnv("development", "3002");
    const a = devScopedCookiePrefix("edura");
    setEnv("development", "3042");
    const b = devScopedCookiePrefix("edura");
    expect(a).not.toBe(b);
  });

  it("keeps www and the back office distinct at every port", () => {
    setEnv("development", "3004");
    expect(devScopedCookiePrefix("edura")).not.toBe(
      devScopedCookiePrefix("edura-superadmin"),
    );
  });

  it("NEVER changes the name in production", () => {
    setEnv("production", "3002");
    expect(devScopedCookiePrefix("edura")).toBe("edura");
    setEnv("production", "8080");
    expect(devScopedCookiePrefix("edura-superadmin")).toBe("edura-superadmin");
  });

  it("falls back to the bare name when PORT is absent or junk", () => {
    setEnv("development", undefined);
    expect(devScopedCookiePrefix("edura")).toBe("edura");
    setEnv("development", "");
    expect(devScopedCookiePrefix("edura")).toBe("edura");
    setEnv("development", "not-a-port");
    expect(devScopedCookiePrefix("edura")).toBe("edura");
    setEnv("development", "3002; DROP");
    expect(devScopedCookiePrefix("edura")).toBe("edura");
  });

  it("EDURA_DEV_COOKIE_PORT names the frontend's port for a service on its own PORT", () => {
    setEnv("development", "3006", "3002");
    expect(devScopedCookiePrefix("edura")).toBe("edura-3002");
    setEnv("development", "3006", "");
    expect(devScopedCookiePrefix("edura")).toBe("edura-3006");
    setEnv("development", "3006", "junk");
    expect(devScopedCookiePrefix("edura")).toBe("edura");
    setEnv("production", "3006", "3002");
    expect(devScopedCookiePrefix("edura")).toBe("edura");
  });

  it("the derived cookie names track the prefix, both plain and __Secure-", () => {
    setEnv("development", "3042");
    expect(sessionCookieNames(devScopedCookiePrefix("edura"))).toEqual([
      "edura-3042.session_token",
      "__Secure-edura-3042.session_token",
    ]);
  });
});

describe("the two fixes cover different halves", () => {
  it("replacement leaves ONE valid cookie, so the ambiguity guard cannot fire", () => {
    const afterReplacement = "edura-3002.session_token=THE_OTHER_PERSONS_TOKEN";
    expect(isSessionAmbiguous(afterReplacement, "edura-3002")).toBe(false);
    expect(presentedSessionTokens(afterReplacement, "edura-3002")).toHaveLength(1);
  });

  it("two tokens on one request still register as ambiguous", () => {
    const both = "edura.session_token=A; edura.session_token=B";
    expect(isSessionAmbiguous(both, "edura")).toBe(true);
  });

  it("two IDENTICAL copies are one credential, not a conflict", () => {
    const dup = "edura.session_token=A; edura.session_token=A";
    expect(isSessionAmbiguous(dup, "edura")).toBe(false);
  });
});

describe("sessionTokenId / presentedSessionTokenIds", () => {
  it("takes the token, dropping better-auth's signature", () => {
    expect(sessionTokenId("TOKEN.SIGNATURE")).toBe("TOKEN");
  });

  it("URL-decodes first — a base64 signature carries + and =", () => {
    expect(sessionTokenId("TOKEN%2ESIGNATURE")).toBe("TOKEN");
    expect(sessionTokenId("TOKEN.MPr7R13KPRC7YD5H6pctNSYlJwB3J8Yqvdy8%2BLaetqE%3D")).toBe(
      "TOKEN",
    );
  });

  it("survives a malformed value instead of throwing", () => {
    expect(() => sessionTokenId("%E0%A4%A")).not.toThrow();
  });

  it("collects EVERY distinct token the request carried", () => {
    const both = "edura.session_token=A.sigA; edura.session_token=B.sigB";
    expect(presentedSessionTokenIds(both, "edura")).toEqual(["A", "B"]);
  });

  it("reads the __Secure- name too, so production is not exempt", () => {
    const secure = "__Secure-edura.session_token=P.sig";
    expect(presentedSessionTokenIds(secure, "edura")).toEqual(["P"]);
  });

  it("ignores every other cookie in the jar", () => {
    const noisy =
      "NEXT_LOCALE=ar; edura.session_token=A.sig; edura-superadmin.session_token=BACKOFFICE.sig; theme=dark";
    expect(presentedSessionTokenIds(noisy, "edura")).toEqual(["A"]);
  });

  it("returns nothing when there is nothing — no empty-string deletes", () => {
    expect(presentedSessionTokenIds(null, "edura")).toEqual([]);
    expect(presentedSessionTokenIds("NEXT_LOCALE=ar", "edura")).toEqual([]);
  });
});
