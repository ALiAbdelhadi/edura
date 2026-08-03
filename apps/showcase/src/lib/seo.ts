import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import type { Locale } from "./i18n";
import type { RolePageKey } from "./site-map";

/**
 * Per-page metadata, built from the same message tree the page renders.
 *
 * The title and description are the page's OWN headline and standfirst rather
 * than a second set of strings written for search engines. Two sets would drift,
 * and the drift would be invisible — nobody reads their own `<meta>` tags.
 *
 * `alternates.languages` is what tells a crawler the ar and en pages are the
 * same document in two languages instead of duplicate content, which matters
 * more here than usual: this site is Arabic-first with an English mirror.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3006"
).replace(/\/$/, "");

export async function pageMetadata(
  locale: Locale,
  page: RolePageKey,
): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: page });
  const path = `/${page}`;

  return {
    title: t("title"),
    description: t("body"),
    alternates: {
      canonical: `${SITE_URL}/${locale}${path}`,
      languages: {
        ar: `${SITE_URL}/ar${path}`,
        en: `${SITE_URL}/en${path}`,
        // The default a crawler should follow when it has no language
        // preference. Arabic, because that is the product's primary language.
        "x-default": `${SITE_URL}/ar${path}`,
      },
    },
    openGraph: {
      type: "website",
      locale: locale === "ar" ? "ar_EG" : "en_US",
      url: `${SITE_URL}/${locale}${path}`,
      title: t("title"),
      description: t("body"),
    },
  };
}
