import { HELP_ARTICLES } from "@/features/marketing/help/articles";
import { MARKETING_LINKS } from "@/features/marketing/nav";
import { routing } from "@/i18n/routing";
import { appBaseUrl } from "@repo/server-core/http/app-url";
import type { MetadataRoute } from "next";

const BASE_URL = appBaseUrl();

const AUTH_PATHS = ["/login", "/register", "/forgot-password"];

function entry(path: string, priority: number): MetadataRoute.Sitemap[number] {
  return {
    url: `${BASE_URL}/${routing.defaultLocale}${path}`,
    priority,
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [locale, `${BASE_URL}/${locale}${path}`]),
      ),
    },
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...MARKETING_LINKS.filter((l) => l.inSitemap).map((l) =>
      entry(l.href, l.href === "" ? 1 : 0.8),
    ),
    ...HELP_ARTICLES.map((a) => entry(`/help/${a.slug}`, 0.6)),
    ...AUTH_PATHS.map((p) => entry(p, 0.5)),
  ];
}
