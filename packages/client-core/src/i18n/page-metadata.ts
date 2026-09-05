import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { Locale } from "./locale";

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
