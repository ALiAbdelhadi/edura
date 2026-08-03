// =============================================================================
// Which paths the next-intl middleware is allowed to claim.
//
// Its own module so it can be unit-tested. Importing `src/proxy.ts` from a test
// drags next-intl's middleware in with it, which cannot resolve `next/server`
// outside a Next runtime — so the matcher would have been untestable exactly
// where it had already caused an outage.
//
// EXCLUSIONS, and why each one is here:
//   api      — route handlers; never localised.
//   ingest   — the PostHog reverse proxy (next.config.ts rewrites). Omitting it
//              307'd `POST /ingest/e/` to `/ar/ingest/e` and silently dropped
//              EVERY analytics event (fixed 2026-08-02).
//   _next    — build output.
//   _vercel  — platform endpoints.
//   .*\..*   — anything with a file extension.
//
// Adding an exclusion is a two-sided risk: too narrow and the middleware eats
// an endpoint, too wide and real pages stop being localised. Both directions
// are asserted in tests/unit/ingest-proxy.test.ts.
// =============================================================================

// Each name is followed by `(?:/|$)`, so the exclusion matches a whole PATH
// SEGMENT rather than a prefix. Without that anchor `/ingestion-report` is
// excluded because it starts with "ingest" — a page would silently lose its
// locale, which is the mirror-image failure of the bug this file documents.
// The un-anchored form had the same latent flaw for `api` (`/apifoo`).
export const INTL_MATCHER = "/((?!(?:api|ingest|_next|_vercel)(?:/|$)|.*\\..*).*)";

/** Exported for the tests; mirrors how Next applies `config.matcher`. */
export function isLocalisedPath(pathname: string): boolean {
  return new RegExp(`^${INTL_MATCHER}$`).test(pathname);
}
