import { PricingScreen } from "@/features/marketing/pricing-screen";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/lib/i18n";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "marketing" });
  return {
    title: t("pricing.meta.title"),
    description: t("pricing.meta.description"),
    alternates: {
      canonical: `/${locale}/pricing`,
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}/pricing`])),
    },
  };
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <PricingScreen locale={locale as Locale} />;
}
