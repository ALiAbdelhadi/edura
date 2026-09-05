import createMiddleware from "next-intl/middleware";
import { NextRequest, type NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { buildPageCsp, cspHeaderName, erpFormActionFromEnv, mintNonce } from "./lib/security/csp";

const intl = createMiddleware(routing);

/** SECURITY_AUDIT.md M-09 — see apps/erp/src/proxy.ts. */
export default function middleware(request: NextRequest): NextResponse {
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

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
