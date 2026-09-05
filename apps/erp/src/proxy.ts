import createMiddleware from "next-intl/middleware";
import { NextRequest, type NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { buildPageCsp, cspHeaderName, mintNonce } from "./lib/security/csp";

const intl = createMiddleware(routing);

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

  const response = intl(new NextRequest(request, { headers: requestHeaders }));
  response.headers.set(headerName, csp);
  return response;
}

export const config = {
  matcher: ["/((?!(?:api|ingest|_next|_vercel)(?:/|$)|.*\\..*).*)"],
};
