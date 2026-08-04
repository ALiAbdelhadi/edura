/**
 * ============================================================================
 * AUTH ENV NAMES — better-auth's own, with the NextAuth names as a fallback
 * ============================================================================
 * next-auth the PACKAGE is long gone: no dependency, no import, no file. What
 * survived the migration is its VOCABULARY — `NEXTAUTH_SECRET` and
 * `NEXTAUTH_URL` are still what better-auth is handed, because the migration
 * deliberately introduced zero new env vars (CLAUDE.md, better-auth section) so
 * that no deployment had to change on the day the code did.
 *
 * That was right then and is confusing now: the names describe a library the
 * codebase no longer contains.
 *
 * WHY THIS IS A FALLBACK AND NOT A RENAME. These values do not live in the
 * repo. They live in two Vercel projects, in Railway, in CI, and in local
 * `.env` files. Code that reads only `BETTER_AUTH_SECRET` and ships to a
 * deployment still holding `NEXTAUTH_SECRET` gets `secret: undefined` — and
 * better-auth with no secret cannot verify a single existing session. Every
 * signed-in user is signed out and no new sign-in works. That is a total auth
 * outage produced by a cosmetic change, and it is the same shape as the
 * 2026-08-01 incident: code shipped ahead of the environment it needed.
 *
 * So both names work, new one preferred. Nothing breaks in any deployment
 * order. Once `BETTER_AUTH_*` is set in Vercel, Railway and CI, delete the
 * fallback and this file's reason for existing goes with it — see
 * docs/runbooks/auth-env-rename.md for the cutover.
 * ============================================================================
 */

/** Read the first of `names` that is set to a non-empty value. */
function firstSet(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return undefined;
}

/** The signing secret for the www app's better-auth instance. */
export function authSecret(): string | undefined {
  return firstSet("BETTER_AUTH_SECRET", "NEXTAUTH_SECRET");
}

/**
 * The back office's SEPARATE signing secret (M2 boundary separation). Kept
 * distinct so a leak of one app's secret cannot mint the other's sessions.
 */
export function superadminAuthSecret(): string | undefined {
  return firstSet("SUPERADMIN_BETTER_AUTH_SECRET", "SUPERADMIN_NEXTAUTH_SECRET");
}

/**
 * The public origin of the app. `undefined` when unset — callers own their
 * default, because it differs per app (www 3002, superadmin 3004) and a wrong
 * shared default is worse than none.
 */
export function authBaseUrl(): string | undefined {
  return firstSet("BETTER_AUTH_URL", "NEXTAUTH_URL");
}

/**
 * Whether the deployment is still relying on the legacy names. Surfaced so the
 * cutover can be verified from outside rather than assumed — a fallback nobody
 * can see is a fallback nobody removes.
 */
export function usingLegacyAuthEnvNames(): boolean {
  const legacy = ["NEXTAUTH_SECRET", "NEXTAUTH_URL", "SUPERADMIN_NEXTAUTH_SECRET"];
  const modern = ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "SUPERADMIN_BETTER_AUTH_SECRET"];
  return legacy.some((n, i) => !!process.env[n] && !process.env[modern[i]!]);
}
