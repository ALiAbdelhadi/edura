import type { MetadataRoute } from "next";

import { DEFAULT_LOCALE, LOCALES } from "@/i18n/config";
import { PUBLIC_ROUTES } from "@/lib/routes";
import { siteUrl } from "@/lib/site-origin";

/**
 * The sitemap — every public route, in both languages, each declaring the
 * other as its alternate.
 *
 * TWO THINGS THAT ARE EASY TO GET WRONG AND ARE DONE ON PURPOSE HERE:
 *
 *  1. **Every entry carries `alternates.languages`.** This site is genuinely
 *     bilingual — the same page exists at `/ar/pricing` and `/en/pricing` —
 *     and without hreflang a crawler treats those two as competing duplicates
 *     and picks one. Which is exactly backwards for a product whose whole
 *     pitch is "Arabic first, not translated later": the version it drops
 *     would as likely as not be the Arabic one.
 *
 *  2. **`x-default` points at Arabic**, not at English. The convention in most
 *     examples is to default to English; here the audience is Egyptian and
 *     Arabic is the primary language, so `x-default` follows
 *     `DEFAULT_LOCALE` rather than a habit.
 *
 * `lastModified` is deliberately ABSENT. This is a static marketing site whose
 * content changes when someone edits a file, and a `lastModified` of "now" —
 * which is what a build timestamp amounts to — tells a crawler that every page
 * changed on every deploy. That trains it to ignore the field. Omitting it is
 * more truthful than a date this file cannot actually know.
 */
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
