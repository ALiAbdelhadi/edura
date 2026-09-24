// Lets the CDN answer a public GET without invoking the function or touching the
// database. Every other response in the product carries `Cache-Control:
// no-store` from `ok()`, and that stays the default — this is the one sanctioned
// way to replace it.
//
// THE CONDITION IS NOT "the route is public". It is "the response is identical
// for every caller". A CDN looks up its cache BEFORE the function runs, keyed on
// the URL — not on the cookie. So a route that reads the session, even on only
// one branch, must never carry this: an anonymous request would fill the cache
// and a signed-in caller at the same URL would be handed the anonymous answer.
// That is why `search/courses`, `search/teacher-days` and `v1/courses` are not
// eligible even though they have an anonymous branch.
//
// Which routes may use it is enforced, not trusted: tests/unit/route-conventions
// requires a `cdnCache: true` entry in its PUBLIC_ROUTES allowlist — whose
// members are already proven to contain no session read — and fails if this
// wrapper appears anywhere else.
//
// Only a 200 is marked. A 404, a 429 from the rate limiter, or a 500 served from
// a CDN to everybody would turn one caller's bad moment into everyone's, so those
// keep `no-store`. A response that sets a cookie is never marked either.
//
// `max-age=0` keeps the BROWSER out of it: the client's freshness is React
// Query's job (QUERY_FRESHNESS), and a browser-cached response is one a user
// cannot refresh away after their own action. Only the shared cache holds it.

export type PublicCacheProfile = { sMaxAge: number; staleWhileRevalidate: number };

export const PUBLIC_CACHE = {
  // Search listings and public profiles. The status gate lives inside these
  // responses — a suspended centre must disappear — so the worst case is kept to
  // about two minutes: 60s fresh, then at most 60s served stale while the CDN
  // refetches in the background.
  discovery: { sMaxAge: 60, staleWhileRevalidate: 60 },
  // Values derived from environment variables only. They cannot change without a
  // redeploy, and a deploy gives the CDN a fresh cache, so the hour is a ceiling
  // that never actually binds.
  deployment: { sMaxAge: 3600, staleWhileRevalidate: 60 },
} as const satisfies Record<string, PublicCacheProfile>;

export function publicCacheControl(profile: PublicCacheProfile): string {
  return `public, max-age=0, s-maxage=${profile.sMaxAge}, stale-while-revalidate=${profile.staleWhileRevalidate}`;
}

export function withPublicCache<A extends unknown[], R extends Response>(
  handler: (...args: A) => R | Promise<R>,
  profile: PublicCacheProfile,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const res = await handler(...args);
    if (res.status !== 200 || res.headers.has("set-cookie")) return res;
    res.headers.set("Cache-Control", publicCacheControl(profile));
    return res;
  };
}
