import { HelpIndexScreen } from "@/features/marketing/help/help-index-screen";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/lib/i18n";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "marketing" });
  return {
    title: t("help.meta.title"),
    description: t("help.meta.description"),
    alternates: {
      canonical: `/${locale}/help`,
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}/help`])),
    },
  };
}

export default async function HelpPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Required for static rendering with next-intl: without it the page opts into
  // dynamic rendering and the build-time filesystem reads in help/load.ts would
  // move to request time.
  setRequestLocale(locale as Locale);
  return <HelpIndexScreen locale={locale as Locale} />;
}
