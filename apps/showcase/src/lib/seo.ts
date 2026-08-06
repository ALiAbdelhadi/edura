import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { Locale } from "./i18n";
import type { RolePageKey } from "./site-map";

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
