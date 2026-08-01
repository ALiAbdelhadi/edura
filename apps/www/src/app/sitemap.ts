import { HELP_ARTICLES } from "@/features/marketing/help/articles";
import { MARKETING_LINKS } from "@/features/marketing/nav";
import { routing } from "@/i18n/routing";
import { appBaseUrl } from "@repo/server-core/http/app-url";
import type { MetadataRoute } from "next";

const BASE_URL = appBaseUrl();

/**
 * The public URL set, DERIVED rather than hand-listed.
 *
 * `MARKETING_LINKS` is the same table the header and footer render from, so a
 * page cannot be in the navigation and missing from the sitemap (or the
 * reverse) — which is how /terms and /privacy came to be reachable from exactly
 * one place. Help articles come from their own content index for the same
 * reason: writing an article publishes it.
 *
 * The auth entry points stay a separate list because they are not marketing
 * pages and deliberately do not appear in the nav table.
 */
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
