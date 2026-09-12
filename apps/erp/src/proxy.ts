import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { handleFromHost, publicProfilePath, publicRootDomain } from "./lib/public-site/host";
import { isLocalisedPath } from "./i18n/route-matcher";
import { buildPageCsp, cspHeaderName, mintNonce } from "./lib/security/csp";

const intl = createMiddleware(routing);

// `<handle>.<PUBLIC_ROOT_DOMAIN>` is a tenant's public page and NOTHING else.
// The root of that host (and its bare locale) is rewritten to /[locale]/p/
// <handle>; every other path is sent back to the canonical host. That is
// what keeps auth on one origin: no login form, no session cookie and no
// API call ever lives on a tenant subdomain, so `trustedOrigins` and the
// cookie domain stay exactly as they are. Dormant while PUBLIC_ROOT_DOMAIN
// is unset — see src/lib/public-site/host.ts.
//
// SECURITY_AUDIT.md (2026-09-11) DIFF-01: the matcher used to skip `/api`
// and `/ingest`, so this function never saw them and a sign-in POST on a
// tenant host would have minted a subdomain-scoped cookie. The matcher now
// covers them (MIDDLEWARE_MATCHER in src/i18n/route-matcher.ts); on a tenant
// host they are refused outright (404 — never a redirect that would carry a
// credential to another host), and on the canonical host they pass through
// untouched, exactly as before. `isLocalisedPath` (INTL_MATCHER, unchanged)
// is still what decides whether next-intl and the page CSP run.

function tenantHostResponse(
  request: NextRequest,
  requestHeaders: Headers,
): NextResponse | null {
  const root = publicRootDomain();
  const handle = handleFromHost(request.headers.get("host"), root);
  if (!handle) return null;

  const { pathname, search } = request.nextUrl;
  if (!isLocalisedPath(pathname)) {
    return new NextResponse(null, { status: 404 });
  }
  const atRoot = pathname.match(/^\/(?:(ar|en)\/?)?$/);
  if (!atRoot) {
    const canonical = (process.env.APP_BASE_URL || `https://${root}`).replace(/\/+$/, "");
    return NextResponse.redirect(`${canonical}${pathname}${search}`, 307);
  }

  const locale = atRoot[1] ?? routing.defaultLocale;
  const url = request.nextUrl.clone();
  url.pathname = publicProfilePath(locale, handle);
  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}

/**
 * SECURITY_AUDIT.md M-09. One nonce per request:
 *  - set on the REQUEST headers (`x-nonce`, and the CSP header itself, which
 *    Next reads to nonce its own inline bootstrap scripts) — next-intl copies
 *    `request.headers` into its `NextResponse.next/rewrite({ request })`, so
 *    the override reaches the app;
 *  - set on the RESPONSE so the browser enforces it.
 * Pages read `x-nonce` via `headers()` for the one author-written script tag.
 */
export default function middleware(request: NextRequest): NextResponse {
  // API and ingest paths on the canonical host: no locale routing, no page
  // CSP (next.config.ts carries the API policy). Only the tenant-host refusal
  // above applies to them.
  if (!isLocalisedPath(request.nextUrl.pathname)) {
    return tenantHostResponse(request, new Headers(request.headers)) ?? NextResponse.next();
  }

  const nonce = mintNonce();
  const csp = buildPageCsp({
    nonce,
    isDev: process.env.NODE_ENV !== "production",
    realtimeHttp: process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:3005",
  });
  const headerName = cspHeaderName();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(headerName, csp);

  const response =
    tenantHostResponse(request, requestHeaders) ??
    intl(new NextRequest(request, { headers: requestHeaders }));
  response.headers.set(headerName, csp);
  return response;
}

// Must stay a string LITERAL (Next reads it statically) and byte-identical to
// MIDDLEWARE_MATCHER — tests/unit/ingest-proxy.test.ts pins both.
export const config = {
  matcher: ["/((?!(?:_next|_vercel)(?:/|$)|.*\\..*).*)"],
};
