import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { buildPageCsp, cspHeaderName, erpFormActionFromEnv, mintNonce } from "./lib/security/csp";
import { stampProxyClientIp } from "@repo/shared/proxy-client-ip";

const intl = createMiddleware(routing);

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/** SECURITY_AUDIT.md M-09 — see apps/erp/src/proxy.ts. */
export default function middleware(request: NextRequest): NextResponse {
  // API paths: no locale routing, no page CSP (next.config.ts carries the API
  // policy). docs/decisions/backend-separation.md, "Client IP": whatever the
  // browser sent under the two edura names is dropped, and when
  // EDURA_PROXY_SECRET is set the platform-derived IP is stamped for the
  // admin-api service behind the rewrite. Without the secret the request
  // passes through as before.
  if (isApiPath(request.nextUrl.pathname)) {
    const requestHeaders = new Headers(request.headers);
    stampProxyClientIp(requestHeaders, process.env.EDURA_PROXY_SECRET);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const nonce = mintNonce();
  const csp = buildPageCsp({
    nonce,
    isDev: process.env.NODE_ENV !== "production",
    erpFormAction: erpFormActionFromEnv(),
  });
  const headerName = cspHeaderName();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(headerName, csp);

  const response = intl(new NextRequest(request, { headers: requestHeaders }));
  response.headers.set(headerName, csp);
  return response;
}

// `api` left the exclusion list in phase 5 so the stamp above runs on every
// /api request; everything else the matcher skipped before it still skips.
export const config = {
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
