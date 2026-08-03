import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

// ⚠️ THE MATCHER MUST BE A LITERAL. Next STATICALLY ANALYSES this file — it
// parses `config` rather than evaluating it, so an imported constant is not
// resolved and the middleware silently falls back to matching EVERY path.
// (Tried 2026-08-02: `matcher: [INTL_MATCHER]` redirected /api/health to
// /ar/api/health and broke the whole app, while the unit tests still passed.)
//
// So it is duplicated here on purpose. `INTL_MATCHER` in ./i18n/route-matcher
// holds the same string for the tests, and tests/unit/ingest-proxy.test.ts
// asserts the two are byte-identical — a copy with a drift alarm, rather than
// an abstraction that does not survive the build.
//
// Exclusions and why: see ./i18n/route-matcher.
export const config = {
  matcher: ["/((?!(?:api|ingest|_next|_vercel)(?:/|$)|.*\\..*).*)"],
};
