import { PricingScreen } from "@/features/marketing/pricing-screen";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/lib/i18n";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/* THIS DIRECTIVE IS LOAD-BEARING. DO NOT REMOVE IT TO MAKE THE PAGE STATIC.
 *
 * `PricingScreen` calls `getPricingExamples()`, which reads the LIVE
 * `commission_settings` global row — the same row `resolveCommission()` reads
 * when real money is settled. Its own contract is that "changing the platform's
 * rates in the back office changes this page with no code edit".
 *
 * Prerendering would bake a commission rate into static HTML at build time, and
 * a back-office rate change would then stop reaching the public page silently:
 * nothing errors, the page just keeps quoting yesterday's percentage. CLAUDE.md
 * excludes `commission_settings` from caching for the money version of this
 * hazard; this is the public-facing one, where the platform would be misquoting
 * its own prices.
 *
 * Every other public marketing page in this app (/help, /faq, /terms, /privacy,
 * /changelog, /contact) prerenders, because none of them reads configuration.
 * This one is the exception and stays dynamic on purpose. */
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
