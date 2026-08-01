import { ChangelogScreen } from "@/features/marketing/changelog/changelog-screen";
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
    title: t("changelog.meta.title"),
    description: t("changelog.meta.description"),
    alternates: {
      canonical: `/${locale}/changelog`,
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}/changelog`])),
    },
  };
}

export default async function ChangelogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <ChangelogScreen locale={locale as Locale} />;
}
