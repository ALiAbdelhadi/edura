// In development the cookie name carries the dev server's port so parallel dev
// servers cannot share a jar. The cookie belongs to the frontend origin, not to
// the port a process listens on: apps/api runs on its own PORT yet reads and
// sets the ERP's cookie, so it names the ERP's port in EDURA_DEV_COOKIE_PORT.
export function devScopedCookiePrefix(base: string): string {
  if (process.env.NODE_ENV !== "development") return base;
  const port = process.env.EDURA_DEV_COOKIE_PORT?.trim() || process.env.PORT?.trim();
  if (!port || !/^\d{2,5}$/.test(port)) return base;
  return `${base}-${port}`;
}

export function sessionCookieNames(cookiePrefix: string): string[] {
  const base = `${cookiePrefix}.session_token`;
  return [base, `__Secure-${base}`];
}

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

export function isSessionAmbiguous(
  cookieHeader: string | null | undefined,
  cookiePrefix: string,
): boolean {
  return presentedSessionTokens(cookieHeader, cookiePrefix).length > 1;
}

export function sessionTokenId(cookieValue: string): string {
  let decoded = cookieValue;
  try {
    decoded = decodeURIComponent(cookieValue);
  } catch {}
  const dot = decoded.indexOf(".");
  return dot === -1 ? decoded : decoded.slice(0, dot);
}

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
