import type { MetadataRoute } from "next";

import { DEFAULT_LOCALE, LOCALES } from "@/i18n/config";
import { PUBLIC_ROUTES } from "@/lib/routes";
import { siteUrl } from "@/lib/site-origin";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.flatMap((route) =>
    LOCALES.map((locale) => ({
      url: siteUrl(locale, route.path),
      changeFrequency: route.changeFrequency,
      priority: route.priority,
      alternates: {
        languages: {
          ...Object.fromEntries(LOCALES.map((l) => [l, siteUrl(l, route.path)])),
          "x-default": siteUrl(DEFAULT_LOCALE, route.path),
        },
      },
    })),
  );
}
