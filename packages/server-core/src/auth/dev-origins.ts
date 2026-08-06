/**
 * ============================================================================
 * DEV-ONLY LOCALHOST ORIGINS
 * ============================================================================
 * better-auth rejects a request whose `Origin` is not in `trustedOrigins`
 * (403 `INVALID_ORIGIN`). Both apps used to satisfy that with a hand-written
 * list of preview ports:
 *
 *     ["http://localhost:3002", "http://localhost:3021", …]
 *
 * That list is a copy of `.claude/launch.json` maintained by hand, and it
 * drifted the moment anyone added a preview config — which is not rare here,
 * since every worktree runs its own dev server on its own port. The failure it
 * produces is badly misleading: sign-in returns 403 while the credentials are
 * perfectly valid, so it reads as "the demo accounts are broken" rather than
 * "this port is not on a list". That misdiagnosis has already cost real time.
 *
 * So the ports are not enumerated any more. In development ONLY, any localhost
 * origin is trusted. Production is untouched: `devLocalhostOrigins()` returns
 * an empty array there, leaving `baseURL` as the only trusted origin, and the
 * wildcards below can never widen a deployed app because a real deployment is
 * not served from localhost.
 *
 * The patterns are host-anchored on purpose. better-auth wildcard-matches a
 * pattern containing `*` and `://` against the request's ORIGIN, so
 * `http://localhost:*` matches `http://localhost:3058` and nothing else —
 * notably not `http://localhost.evil.com`, which is a different host, and not
 * any `https://` origin.
 */

/** Localhost origin patterns to trust in development; empty in production. */
export function devLocalhostOrigins(): string[] {
  if (process.env.NODE_ENV === "production") return [];
  return [
    "http://localhost:*",
    "http://127.0.0.1:*",
    // The bare forms, for a dev server reached on the default port 80.
    "http://localhost",
    "http://127.0.0.1",
  ];
}
