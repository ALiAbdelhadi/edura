// Moved unchanged from token-bucket.ts (2026-09-30) so the ERP proxy can stamp
// the client IP without pulling the Redis limiter into its bundle; token-bucket
// re-exports trustedClientIp, so every existing importer is untouched.
const MAX_IP_LEN = 45; // an IPv6 address with an embedded IPv4 tail is 45 chars
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_CHARS = /^[0-9a-f:.]+$/i;

// The value reaches a Redis key, `audit_logs.ip_address` and
// `contact_submissions.ip`, and every byte of it came from a header. Anything
// that is not an IP is not evidence and must not be stored as if it were: an
// unbounded string is an unbounded key, and free text in an audit column is log
// poisoning. Returns null for anything that does not parse.
export function normalizeIp(raw: string | null | undefined): string | null {
  let v = raw?.trim() ?? "";
  if (!v || v.length > MAX_IP_LEN + 8) return null;
  const bracketed = /^\[(.+)\](?::\d{1,5})?$/.exec(v)?.[1];
  if (bracketed) v = bracketed;
  else if (v.includes(":")) {
    const head = v.split(":")[0] ?? "";
    if (IPV4.test(head)) v = head;
  }
  if (v.length > MAX_IP_LEN) return null;
  if (IPV4.test(v)) {
    return v.split(".").every((o) => Number(o) <= 255) ? v : null;
  }
  if (v.includes(":") && IPV6_CHARS.test(v)) return v.toLowerCase();
  return null;
}

/**
 * The client IP, as the limiter and the audit log are allowed to believe it.
 *
 * SECURITY_AUDIT.md L-12 fixed the SELECTION (which XFF entry to read). What it
 * could not fix is that `x-forwarded-for` is a client-writable header whose
 * trustworthiness is borrowed entirely from the edge in front of the app: with
 * TRUSTED_PROXY_HOPS=1 the code reads the LAST entry and is only correct while
 * the edge APPENDS. A platform that forwards a client-supplied XFF unchanged
 * turns every per-IP limit into one the attacker steers by rotating a header.
 *
 * So a platform header the edge sets itself wins whenever one exists, before any
 * XFF arithmetic is done: `TRUSTED_CLIENT_IP_HEADER` if the deployment names one,
 * then Vercel's own `x-vercel-forwarded-for` when running there. XFF is the last
 * resort, not the first reading.
 */
export function trustedClientIp(getHeader: (name: string) => string | null | undefined): string {
  const verifiedHeaderName = process.env.TRUSTED_CLIENT_IP_HEADER?.trim();
  if (verifiedHeaderName) {
    const v = normalizeIp(getHeader(verifiedHeaderName));
    if (v) return v;
  }
  if (process.env.VERCEL) {
    const v = normalizeIp(getHeader("x-vercel-forwarded-for"));
    if (v) return v;
  }
  const xff = (getHeader("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (xff.length === 0) return "unknown";
  const hops = Math.max(1, Math.floor(Number(process.env.TRUSTED_PROXY_HOPS ?? 1)) || 1);
  const idx = xff.length - hops;
  // Deliberately NOT falling through to another entry when the trusted position
  // holds something unparseable: the entries an attacker controls are exactly the
  // ones a fallback would reach.
  return normalizeIp(idx >= 0 ? xff[idx] : xff[0]) ?? "unknown";
}
