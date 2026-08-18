/**
 * ONE BROWSER, ONE IDENTITY — and when that is not true, say so instead of
 * guessing.
 *
 * A cookie name is not unique in a jar. Two cookies can carry the SAME name and
 * differ only in `Path` or `Domain`, and the browser then sends BOTH on one
 * request, in an order it chooses (most specific path first, and creation time
 * breaks the tie). The server reads "the" cookie and gets whichever came first.
 *
 * Measured against this app on 2026-08-09, on dev, with two real sessions
 * (`docs/reports/session-identity-mismatch.md`):
 *
 *   Cookie: edura.session_token=A; edura.session_token=B   →  A's owner
 *   Cookie: edura.session_token=B; edura.session_token=A   →  B's owner
 *
 * So the identity the platform serves flips with cookie ORDER — with no
 * sign-in, no sign-out, and nothing visible to the person using it. The same
 * measurement showed sign-out revoking only the FIRST of the two and reporting
 * success, which is how someone logs out on a shared computer and leaves a live
 * session behind.
 *
 * This module is the shared kernel for both: it reads what the request actually
 * presented, rather than what one lookup happened to return. `getSessionUser`
 * uses it to FAIL CLOSED on an ambiguous request, and the sign-out route uses
 * it to revoke every credential the browser sent, not just the resolved one.
 */

/**
 * THE PORT IS NOT PART OF A COOKIE'S IDENTITY, so on one dev machine every
 * server of the same app shares one cookie.
 *
 * RFC 6265 §5.3 keys a cookie on name + domain + path. `localhost:3002` and
 * `localhost:3042` are the same domain, and both www dev servers write
 * `edura.session_token` at path `/`. Measured 2026-08-10 with the byte-identical
 * `Set-Cookie` these apps send:
 *
 *     entries named edura.session_token in the jar: 1
 *     * Replaced cookie edura.session_token="…3002_admin"
 *           for domain localhost, path /
 *
 * The second server does not add an identity — it REPLACES the first. A tab
 * still open on the other port then renders the person who is no longer signed
 * in while the server answers as somebody else, which is the failure in
 * docs/reports/session-identity-mismatch.md.
 *
 * Note what this is NOT: `isSessionAmbiguous` below needs TWO tokens on one
 * request to fire, and replacement leaves exactly one — valid, and belonging to
 * the wrong person. That guard cannot catch this case; only separate names can.
 * The two fixes cover different halves and neither is redundant.
 *
 * Development only, deliberately. Production serves each app from ONE hostname
 * so nothing collides, and a cookie name that varied per instance would sign
 * people out whenever a serverless request landed on a different box. `PORT` is
 * what Next's dev server exports for `-p` (verified 2026-08-10: a server started
 * with `next dev -p 3002` issues `edura-3002.session_token`). If it is ever
 * unreadable the base name is used — the pre-existing behaviour, which is the
 * collision this fixes, never a broken session.
 */
export function devScopedCookiePrefix(base: string): string {
  if (process.env.NODE_ENV !== "development") return base;
  const port = process.env.PORT?.trim();
  if (!port || !/^\d{2,5}$/.test(port)) return base;
  return `${base}-${port}`;
}

/**
 * better-auth adds the `__Secure-` prefix when it issues cookies over HTTPS, so
 * production and development carry different NAMES for the same thing. Both are
 * checked — a guard that only knows the dev name would be inert exactly where
 * it matters.
 */
export function sessionCookieNames(cookiePrefix: string): string[] {
  const base = `${cookiePrefix}.session_token`;
  return [base, `__Secure-${base}`];
}

/**
 * Every DISTINCT session-token value the request carried.
 *
 * Deliberately returns the raw cookie values, deduplicated: two identical
 * copies of one credential are not an ambiguity (a proxy can duplicate a
 * header), two different values are.
 */
export function presentedSessionTokens(
  cookieHeader: string | null | undefined,
  cookiePrefix: string,
): string[] {
  if (!cookieHeader) return [];
  const names = new Set(sessionCookieNames(cookiePrefix));
  const seen = new Set<string>();

  for (const pair of cookieHeader.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    if (!names.has(name)) continue;
    const value = pair.slice(eq + 1).trim();
    if (value) seen.add(value);
  }

  return [...seen];
}

/**
 * TRUE when the request presented more than one identity.
 *
 * The caller's only correct response is to refuse and clear — never to pick.
 * Picking is what produced the flip this module exists to end.
 */
export function isSessionAmbiguous(
  cookieHeader: string | null | undefined,
  cookiePrefix: string,
): boolean {
  return presentedSessionTokens(cookieHeader, cookiePrefix).length > 1;
}

/**
 * The `auth_sessions.token` behind a cookie value.
 *
 * better-auth stores `<token>.<signature>` in the cookie and only `<token>` in
 * the row. Splitting on the FIRST separator is what makes a revoke-by-token
 * possible for a credential the framework itself did not resolve. The value is
 * URL-encoded in transit (the signature is base64 and carries `+` and `=`), so
 * it is decoded first — an un-decoded value would simply match no row, and a
 * revoke that silently matches nothing is the failure this is meant to prevent.
 */
export function sessionTokenId(cookieValue: string): string {
  let decoded = cookieValue;
  try {
    decoded = decodeURIComponent(cookieValue);
  } catch {
    // A malformed value cannot be decoded; it also cannot match a row. Keep it
    // as-is rather than throwing — this runs on the sign-out path, and sign-out
    // must never fail because of a corrupt cookie.
  }
  const dot = decoded.indexOf(".");
  return dot === -1 ? decoded : decoded.slice(0, dot);
}

/** Every distinct `auth_sessions.token` the request presented. */
export function presentedSessionTokenIds(
  cookieHeader: string | null | undefined,
  cookiePrefix: string,
): string[] {
  return [
    ...new Set(
      presentedSessionTokens(cookieHeader, cookiePrefix).map(sessionTokenId),
    ),
  ].filter(Boolean);
}
