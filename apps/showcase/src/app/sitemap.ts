import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/seo";
import { ROLE_PAGES } from "@/lib/site-map";
import type { MetadataRoute } from "next";

/**
 * Built from `ROLE_PAGES`, the same table the header and footer read.
 *
 * apps/www drives its sitemap from `MARKETING_LINKS` for the reason stated
 * there: a page must not be able to exist while being invisible to search.
 * This site holds itself to the same rule — adding a page is a row in
 * `site-map.ts`, and the nav and the sitemap both follow.
 *
 * Only THIS site's pages appear. Linking to www's /pricing or /help from here
 * would claim them for this sitemap, and they already have their own.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", ...ROLE_PAGES.map((p) => p.href)];

  return paths.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      changeFrequency: "monthly" as const,
      priority: path === "" ? 1 : 0.8,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((l) => [l, `${SITE_URL}/${l}${path}`]),
        ),
      },
    })),
  );
}
