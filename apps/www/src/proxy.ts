import { NextResponse, type NextRequest } from "next/server";

import { DEFAULT_LOCALE, LOCALES } from "@/i18n/config";

/**
 * Every page lives under `/[locale]`, so the bare root has to go somewhere.
 * It resolves from the browser's own Accept-Language when that names a locale
 * this site actually has, and falls back to Arabic — the default, because
 * this product's market reads Arabic first.
 *
 * A 307, not a 308: a permanent redirect is cached hard by browsers, and the
 * locale decision here is one we may still want to change.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasLocale = LOCALES.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
  if (hasLocale) return NextResponse.next();

  const preferred = pickLocale(request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = `/${preferred}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url, 307);
}

function pickLocale(header: string | null) {
  if (!header) return DEFAULT_LOCALE;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase() ?? "";
    const base = tag.split("-")[0];
    const hit = LOCALES.find((locale) => locale === base);
    if (hit) return hit;
  }
  return DEFAULT_LOCALE;
}

export const config = {
  /* `api` is excluded, and it has to be.
     Everything else on this site is a page and therefore needs a locale, so
     the matcher redirects anything without one. `/api/contact` has no locale
     and never will — it is a machine endpoint — so without this exclusion the
     form's POST was answered with a 307 to `/ar/api/contact`, which does not
     exist. A redirected POST also loses its body, so the failure was silent on
     the server and looked like a network error in the browser. */
  matcher: ["/((?!api|_next|favicon.ico|.*\\..*).*)"],
};
