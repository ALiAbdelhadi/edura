import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/lib/i18n";

/**
 * Localized `<title>` for dashboard pages — "<nav label> | Edura" in the
 * page's own locale. The label comes from the same `nav.*` keys the sidebar
 * renders, so the tab and the nav item can never disagree.
 */
export function localizedTitle(navKey: string) {
  return async ({
    params,
  }: {
    params: Promise<{ locale: string }>;
  }): Promise<Metadata> => {
    const { locale } = await params;
    const t = await getTranslations({ locale: locale as Locale, namespace: "nav" });
    return { title: `${t(navKey as Parameters<typeof t>[0])} | Edura` };
  };
}
