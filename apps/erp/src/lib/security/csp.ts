/**
 * The ERP's Content-Security-Policy, built per request (SECURITY_AUDIT.md M-09).
 *
 * `script-src` used to be `'self' 'unsafe-inline'`, which made React's escaping
 * the only XSS control on the pages that matter most — checkout, wallet, the
 * counter. It is now `'nonce-…' 'strict-dynamic'`: Next's own inline bootstrap
 * scripts carry the nonce it reads from this header on the request, every
 * chunk they load inherits trust, and an injected `<script>` has neither.
 *
 * Pure and edge-safe on purpose: `src/proxy.ts` (middleware) mints the nonce
 * and calls this for every page; `next.config.ts` calls it once, nonce-less,
 * for the API routes, whose JSON never runs a script.
 */
export function cspHeaderName(env: NodeJS.ProcessEnv = process.env): string {
  return env.CSP_MODE === "report-only"
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";
}

export type CspOptions = {
  nonce?: string;
  isDev: boolean;
  realtimeHttp: string;
};

export function buildPageCsp(opts: CspOptions): string {
  const realtimeWs = opts.realtimeHttp.replace(/^http/, "ws");
  const scriptSrc = opts.nonce
    ? `script-src 'self' 'nonce-${opts.nonce}' 'strict-dynamic'${opts.isDev ? " 'unsafe-eval'" : ""}`
    : // No nonce means no inline script at all — never 'unsafe-inline' again.
      `script-src 'self'${opts.isDev ? " 'unsafe-eval'" : ""}`;
  return [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'self'`,
    `form-action 'self'`,
    `img-src 'self' data: blob: https://res.cloudinary.com`,
    `font-src 'self' data:`,
    `style-src 'self' 'unsafe-inline'`,
    scriptSrc,
    `connect-src 'self' ${opts.realtimeHttp} ${realtimeWs} https://*.ingest.sentry.io https://*.ingest.de.sentry.io`,
    `frame-src 'self' https://accept.paymob.com`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `report-uri /api/v1/security/csp-report`,
    `report-to csp-endpoint`,
  ].join("; ");
}

/** API routes serve JSON: nothing may load, embed or frame them. */
export function buildApiCsp(): string {
  return [
    `default-src 'none'`,
    `frame-ancestors 'none'`,
    `report-uri /api/v1/security/csp-report`,
    `report-to csp-endpoint`,
  ].join("; ");
}

export function mintNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
