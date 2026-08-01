import { PricingScreen } from "@/features/marketing/pricing-screen";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/lib/i18n";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/**
 * DELIBERATELY DYNAMIC, despite being a content page.
 *
 * The worked example is computed from the live `commission_settings` global row
 * (see lib/services/pricing/public-rates.ts). Prerendering it would freeze the
 * platform's published rates into HTML at build time — exactly the drift this
 * page exists to prevent, and the reason a rate change in the back office must
 * show up here without a redeploy. The cost is one indexed single-row read per
 * visit, and the read already degrades to the engine's own fallback constants
 * if the database is unreachable.
 */
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
