import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

const BASE_URL = (process.env.APP_BASE_URL ?? "http://localhost:3002").replace(
  /\/$/,
  "",
);

/**
 * Public, non-auth-gated routes only (locale-agnostic paths). Dashboard routes
 * are behind auth and intentionally excluded.
 *
 * FLAG: the dynamic public pages (/[id], /centers/[id], /courses/[id]) are
 * data-driven and NOT enumerated here — add them from the DB (published
 * profiles/centers/courses) when SEO for those is needed.
 */
const PUBLIC_PATHS = ["", "/login", "/register", "/forgot-password"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: `${BASE_URL}/${routing.defaultLocale}${path}`,
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [locale, `${BASE_URL}/${locale}${path}`]),
      ),
    },
  }));
}
