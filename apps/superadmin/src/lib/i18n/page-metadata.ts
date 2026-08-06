import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/lib/i18n";

/**
 * Localized `<title>` for back-office pages — "<nav label> | Edura" in the
 * page's own locale. Same helper (and same reasoning) as apps/www: the label
 * comes from the `nav.*` keys the sidebar renders, so the browser tab and the
 * nav item can never disagree, and an Arabic page stops carrying an English
 * tab title.
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
