import { NextRequest, NextResponse } from "next/server";

/**
 * Locale-prefix proxy (Next.js 16 replaces the `middleware` convention with
 * `proxy`). PRD §5 i18n routing.
 *
 * Every page lives under app/[locale]/…, but in-app navigation uses bare paths
 * ("/dashboard/admin"). This redirects un-prefixed paths to /{locale}/… so both
 * styles work. Locale: NEXT_LOCALE cookie → Accept-Language → default "ar".
 *
 * API routes, Next internals, and files are never touched.
 */
const LOCALES = ["ar", "en"] as const;
type AppLocale = (typeof LOCALES)[number];
const DEFAULT_LOCALE: AppLocale = "ar";

function isLocale(v: string | undefined): v is AppLocale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

function detectLocale(req: NextRequest): AppLocale {
  const cookie = req.cookies.get("NEXT_LOCALE")?.value;
  if (isLocale(cookie)) return cookie;
  const accept = req.headers.get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const code = part.split(";")[0]?.trim().slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
}

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Never touch API routes, Next internals, or static files.
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const first = pathname.split("/")[1];

  if (isLocale(first)) {
    const res = NextResponse.next();
    if (req.cookies.get("NEXT_LOCALE")?.value !== first) {
      res.cookies.set("NEXT_LOCALE", first, { path: "/", maxAge: 60 * 60 * 24 * 365 });
    }
    return res;
  }

  const locale = detectLocale(req);
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next|favicon\\.ico|.*\\..*).*)"],
};
