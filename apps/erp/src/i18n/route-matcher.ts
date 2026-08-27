export const INTL_MATCHER = "/((?!(?:api|ingest|_next|_vercel)(?:/|$)|.*\\..*).*)";

export function isLocalisedPath(pathname: string): boolean {
  return new RegExp(`^${INTL_MATCHER}$`).test(pathname);
}
