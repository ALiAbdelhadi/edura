export const INTL_MATCHER = "/((?!(?:api|ingest|_next|_vercel)(?:/|$)|.*\\..*).*)";

export function isLocalisedPath(pathname: string): boolean {
  return new RegExp(`^${INTL_MATCHER}$`).test(pathname);
}

/**
 * SECURITY_AUDIT.md (2026-09-11) DIFF-01. What the MIDDLEWARE runs on — wider
 * than what next-intl claims. `api` and `ingest` are in here so the tenant-host
 * branch in src/proxy.ts can refuse them on a `<handle>.<root>` host; on the
 * canonical host the middleware passes them through untouched, because
 * `isLocalisedPath` (INTL_MATCHER above) still says they are not pages.
 * src/proxy.ts carries this as a literal; the ingest-proxy unit test pins the
 * two to each other.
 */
export const MIDDLEWARE_MATCHER = "/((?!(?:_next|_vercel)(?:/|$)|.*\\..*).*)";
