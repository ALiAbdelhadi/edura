import { devScopedCookiePrefix } from "@repo/server-core/auth/session-cookies";

/**
 * ONE definition of this app's cookie namespace.
 *
 * It was a bare literal inside `auth.ts` until the session-integrity guard
 * needed the same string to read the raw `Cookie:` header. A second copy would
 * be the quietest possible failure: the guard would look for a cookie name
 * nothing sets, find nothing, and report every request as unambiguous — a
 * safety check that is permanently, invisibly inert.
 *
 * The value itself is load-bearing: `edura` vs `edura-superadmin` is what keeps
 * a back-office session unreadable by www (see CLAUDE.md, better-auth §7).
 *
 * In development the running port is appended, so two www dev servers on this
 * machine cannot overwrite each other's session — see `devScopedCookiePrefix`,
 * which carries the measurement and the reasoning, and is shared with the back
 * office so the two apps cannot drift on it.
 */
export const SESSION_COOKIE_PREFIX = devScopedCookiePrefix("edura");
