import { afterEach, describe, expect, it, vi } from "vitest";

import {
  authBaseUrl,
  authSecret,
  superadminAuthSecret,
  usingLegacyAuthEnvNames,
} from "@repo/server-core/auth/auth-env";

/**
 * next-auth the package is gone; its VOCABULARY outlived it. These names are
 * being retired, but they cannot simply be renamed: the values live in two
 * Vercel projects, in Railway, in CI and in local .env files, none of which are
 * in this repo. Code reading only the new name, shipped to a deployment holding
 * only the old one, hands better-auth `secret: undefined` — no existing session
 * verifies and no new sign-in works. A cosmetic change becomes a total auth
 * outage, in the same shape as the 2026-08-01 incident.
 *
 * So both names resolve, and that has to stay true until the cutover is done.
 * These tests are what makes deleting the fallback later a deliberate act
 * rather than an accident.
 */

afterEach(() => vi.unstubAllEnvs());

const clear = () => {
  for (const n of [
    "BETTER_AUTH_SECRET",
    "NEXTAUTH_SECRET",
    "BETTER_AUTH_URL",
    "NEXTAUTH_URL",
    "SUPERADMIN_BETTER_AUTH_SECRET",
    "SUPERADMIN_NEXTAUTH_SECRET",
  ]) {
    vi.stubEnv(n, "");
  }
};

describe("auth env names — new preferred, legacy still honoured", () => {
  it("prefers BETTER_AUTH_SECRET when both are set", () => {
    clear();
    vi.stubEnv("NEXTAUTH_SECRET", "legacy");
    vi.stubEnv("BETTER_AUTH_SECRET", "modern");
    expect(authSecret()).toBe("modern");
  });

  it("falls back to NEXTAUTH_SECRET — the deployment that has not cut over yet", () => {
    clear();
    vi.stubEnv("NEXTAUTH_SECRET", "legacy");
    expect(authSecret()).toBe("legacy");
  });

  it("is undefined when neither is set, rather than an empty string", () => {
    clear();
    // better-auth must receive undefined, not "", or it would sign with an
    // empty key instead of refusing.
    expect(authSecret()).toBeUndefined();
  });

  it("treats an empty value as unset, so a blank Vercel var does not win", () => {
    clear();
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "legacy");
    expect(authSecret()).toBe("legacy");
  });

  it("resolves the base URL both ways", () => {
    clear();
    vi.stubEnv("NEXTAUTH_URL", "https://legacy.example");
    expect(authBaseUrl()).toBe("https://legacy.example");
    vi.stubEnv("BETTER_AUTH_URL", "https://modern.example");
    expect(authBaseUrl()).toBe("https://modern.example");
  });

  it("keeps the back office's secret SEPARATE from the app's (M2 boundary)", () => {
    clear();
    vi.stubEnv("BETTER_AUTH_SECRET", "www-secret");
    vi.stubEnv("SUPERADMIN_BETTER_AUTH_SECRET", "back-office-secret");
    expect(superadminAuthSecret()).toBe("back-office-secret");
    expect(authSecret()).toBe("www-secret");
    expect(superadminAuthSecret()).not.toBe(authSecret());
  });

  it("falls back for the back office too", () => {
    clear();
    vi.stubEnv("SUPERADMIN_NEXTAUTH_SECRET", "legacy-back-office");
    expect(superadminAuthSecret()).toBe("legacy-back-office");
  });

  /** A fallback nobody can see is a fallback nobody removes. */
  it("reports when a deployment is still on the legacy names", () => {
    clear();
    vi.stubEnv("NEXTAUTH_SECRET", "legacy");
    expect(usingLegacyAuthEnvNames()).toBe(true);

    vi.stubEnv("BETTER_AUTH_SECRET", "modern");
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("SUPERADMIN_NEXTAUTH_SECRET", "");
    expect(usingLegacyAuthEnvNames()).toBe(false);
  });
});
