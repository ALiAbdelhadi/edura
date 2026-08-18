import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  devScopedCookiePrefix,
  isSessionAmbiguous,
  presentedSessionTokenIds,
  presentedSessionTokens,
  sessionCookieNames,
  sessionTokenId,
} from "@repo/server-core/auth/session-cookies";

// ---------------------------------------------------------------------------
// docs/reports/session-identity-mismatch.md — the port-scoped dev prefix.
//
// A cookie is keyed on name + domain + path (RFC 6265 §5.3); the PORT is not
// part of it. So on one dev machine `localhost:3002` and `localhost:3042` write
// the same cookie, and the second server REPLACES the first server's session
// rather than adding to it — which is how a tab kept rendering one person while
// the server answered as another.
//
// This is asserted rather than trusted because the whole mechanism is invisible:
// nothing in the UI changes the day the suffix stops being applied, and the
// symptom only appears when someone happens to have two dev servers up.
// ---------------------------------------------------------------------------

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_PORT = process.env.PORT;

function setEnv(nodeEnv: string | undefined, port: string | undefined) {
  // NODE_ENV is readonly in the Next types but writable at runtime; the test
  // needs both branches and there is no seam to inject.
  (process.env as Record<string, string | undefined>).NODE_ENV = nodeEnv;
  (process.env as Record<string, string | undefined>).PORT = port;
}

beforeEach(() => setEnv(ORIGINAL_NODE_ENV, ORIGINAL_PORT));
afterEach(() => setEnv(ORIGINAL_NODE_ENV, ORIGINAL_PORT));

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
    // If the port suffix ever collapsed these two, a back-office session would
    // become readable by www — the boundary CLAUDE.md calls structural.
    setEnv("development", "3004");
    expect(devScopedCookiePrefix("edura")).not.toBe(
      devScopedCookiePrefix("edura-superadmin"),
    );
  });

  it("NEVER changes the name in production", () => {
    // Production serves one hostname per app, so there is nothing to collide
    // with — and a name that varied per instance would sign people out whenever
    // a request landed on a different serverless box.
    setEnv("production", "3002");
    expect(devScopedCookiePrefix("edura")).toBe("edura");
    setEnv("production", "8080");
    expect(devScopedCookiePrefix("edura-superadmin")).toBe("edura-superadmin");
  });

  it("falls back to the bare name when PORT is absent or junk", () => {
    // The fallback is the PRE-EXISTING behaviour (the collision this fixes),
    // never a broken session — a cookie the app cannot name is worse.
    setEnv("development", undefined);
    expect(devScopedCookiePrefix("edura")).toBe("edura");
    setEnv("development", "");
    expect(devScopedCookiePrefix("edura")).toBe("edura");
    setEnv("development", "not-a-port");
    expect(devScopedCookiePrefix("edura")).toBe("edura");
    setEnv("development", "3002; DROP");
    expect(devScopedCookiePrefix("edura")).toBe("edura");
  });

  it("the derived cookie names track the prefix, both plain and __Secure-", () => {
    // The guard reads the raw Cookie header by NAME. If it ever computed the
    // name from a different prefix than better-auth writes, it would find
    // nothing and report every request as unambiguous — inert, and invisibly so.
    setEnv("development", "3042");
    expect(sessionCookieNames(devScopedCookiePrefix("edura"))).toEqual([
      "edura-3042.session_token",
      "__Secure-edura-3042.session_token",
    ]);
  });
});

describe("the two fixes cover different halves", () => {
  it("replacement leaves ONE valid cookie, so the ambiguity guard cannot fire", () => {
    // This is the finding that made the port suffix necessary: after a second
    // dev server overwrites the cookie there is exactly one token present. It
    // is perfectly valid and belongs to the wrong person, and no amount of
    // conflict detection can see that.
    const afterReplacement = "edura-3002.session_token=THE_OTHER_PERSONS_TOKEN";
    expect(isSessionAmbiguous(afterReplacement, "edura-3002")).toBe(false);
    expect(presentedSessionTokens(afterReplacement, "edura-3002")).toHaveLength(1);
  });

  it("two tokens on one request still register as ambiguous", () => {
    const both = "edura.session_token=A; edura.session_token=B";
    expect(isSessionAmbiguous(both, "edura")).toBe(true);
  });

  it("two IDENTICAL copies are one credential, not a conflict", () => {
    // A proxy can duplicate a header; that is not two people.
    const dup = "edura.session_token=A; edura.session_token=A";
    expect(isSessionAmbiguous(dup, "edura")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The sign-out half. `POST /api/auth/sign-out` revokes every credential the
// request presented, and it can only do that by turning cookie values back into
// `auth_sessions.token`. If this mapping is wrong the delete matches NO row and
// reports success — the exact shape of the bug it exists to fix (a sign-out
// that says it worked and leaves a live session behind).
// ---------------------------------------------------------------------------
describe("sessionTokenId / presentedSessionTokenIds", () => {
  it("takes the token, dropping better-auth's signature", () => {
    expect(sessionTokenId("TOKEN.SIGNATURE")).toBe("TOKEN");
  });

  it("URL-decodes first — a base64 signature carries + and =", () => {
    // The wire value is percent-encoded. Without decoding, the split still
    // happens on the first dot, but a value whose ENCODING hid the dot (%2E)
    // would silently become the whole string and match no row.
    expect(sessionTokenId("TOKEN%2ESIGNATURE")).toBe("TOKEN");
    expect(sessionTokenId("TOKEN.MPr7R13KPRC7YD5H6pctNSYlJwB3J8Yqvdy8%2BLaetqE%3D")).toBe(
      "TOKEN",
    );
  });

  it("survives a malformed value instead of throwing", () => {
    // Sign-out must never fail because a cookie is corrupt.
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
    // `deleteMany({ token: { in: [""] } })` would match nothing, but an empty
    // list is the honest input and keeps the route from issuing a pointless
    // statement on every sign-out.
    expect(presentedSessionTokenIds(null, "edura")).toEqual([]);
    expect(presentedSessionTokenIds("NEXT_LOCALE=ar", "edura")).toEqual([]);
  });
});
