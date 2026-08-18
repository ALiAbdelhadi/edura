import { devScopedCookiePrefix } from "@repo/server-core/auth/session-cookies";

/**
 * ONE definition of the back office's cookie namespace.
 *
 * `edura-superadmin` vs www's `edura` is load-bearing: distinct names (over
 * distinct signing secrets) are what make a back-office session unreadable by
 * www BY CONSTRUCTION — see CLAUDE.md, better-auth §7 and the impersonation
 * boundary in the admin-directory section.
 *
 * The development port is appended for the same reason it is on www: `.claude/
 * launch.json` runs this app on 3004 AND 3037, the port is not part of a
 * cookie's identity, so without this the second server silently replaces the
 * first server's session. Measurement and reasoning live on
 * `devScopedCookiePrefix`, which both apps share so they cannot drift.
 */
export const SESSION_COOKIE_PREFIX = devScopedCookiePrefix("edura-superadmin");
