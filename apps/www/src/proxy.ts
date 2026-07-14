import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * next-intl locale middleware (Next 16 uses `proxy.ts`, not `middleware.ts`).
 *
 * Handles what the old hand-rolled proxy did: `/` → `/<locale>` redirect,
 * Accept-Language negotiation, and NEXT_LOCALE cookie persistence — all driven
 * by `routing` (localePrefix "always", localeDetection true).
 */
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals, and anything with a file extension
  // (static assets + metadata files like sitemap.xml / robots.txt).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
