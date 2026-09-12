/**
 * SECURITY_AUDIT.md (2026-09-11) INJ-01. The login page sends a signed-in user
 * to `?next=`. The old check was `startsWith("/") && !startsWith("//")`, and
 * browsers resolve `/\evil.com` (sent as `/%5Cevil.com`) against the page
 * origin as `https://evil.com/` — an open redirect from the real login host.
 *
 * A safe target is a same-origin PATH: it starts with exactly one `/`, carries
 * no backslash anywhere, and still resolves to the page's own origin when the
 * URL parser is asked.
 */
export function isSafeNext(value: string | null | undefined): value is string {
  if (!value || value.length > 2048) return false;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return false;
  try {
    const probe = "https://edura.invalid";
    return new URL(value, probe).origin === probe;
  } catch {
    return false;
  }
}
