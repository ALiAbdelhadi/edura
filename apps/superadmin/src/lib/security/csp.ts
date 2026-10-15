/**
 * The back office's Content-Security-Policy, built per request
 * (SECURITY_AUDIT.md M-09). See apps/erp/src/lib/security/csp.ts for the
 * reasoning; the differences here are the ones that were always there — never
 * framable, no cross-origin frames, no realtime socket, and one cross-origin
 * form destination (the ERP, for the "view as" handoff).
 */
import { MEDIA_IMG_SRC } from "@repo/shared/media-delivery";

export function cspHeaderName(env: NodeJS.ProcessEnv = process.env): string {
  return env.CSP_MODE === "report-only"
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";
}

export type CspOptions = {
  nonce?: string;
  isDev: boolean;
  /** Derived from ERP_BASE_URL (or APP_BASE_URL), same env the mint route uses. */
  erpFormAction: string;
};

export function buildPageCsp(opts: CspOptions): string {
  const scriptSrc = opts.nonce
    ? `script-src 'self' 'nonce-${opts.nonce}' 'strict-dynamic'${opts.isDev ? " 'unsafe-eval'" : ""}`
    : `script-src 'self'${opts.isDev ? " 'unsafe-eval'" : ""}`;
  return [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `form-action 'self'${opts.erpFormAction ? ` ${opts.erpFormAction}` : ""}`,
    `img-src 'self' data: blob: ${MEDIA_IMG_SRC}`,
    `font-src 'self' data:`,
    `style-src 'self' 'unsafe-inline'`,
    scriptSrc,
    `connect-src 'self' https://*.ingest.sentry.io https://*.ingest.de.sentry.io`,
    `frame-src 'none'`,
    `worker-src 'self'`,
    `report-uri /api/v1/security/csp-report`,
    `report-to csp-endpoint`,
  ].join("; ");
}

export function buildApiCsp(): string {
  return [
    `default-src 'none'`,
    `frame-ancestors 'none'`,
    `report-uri /api/v1/security/csp-report`,
    `report-to csp-endpoint`,
  ].join("; ");
}

export function erpFormActionFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return (env.ERP_BASE_URL || env.APP_BASE_URL || "").replace(/\/+$/, "");
}

export function mintNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
