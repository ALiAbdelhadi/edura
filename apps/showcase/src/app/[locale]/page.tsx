import { FeatureRow } from "@/features/home/feature-row";
import { HomeHero } from "@/features/home/home-hero";
import { ShotProof } from "@/features/home/shot-proof";
import { routing } from "@/i18n/routing";
import { setRequestLocale } from "next-intl/server";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main id="content">
      <HomeHero />
      <FeatureRow />
      <ShotProof />
    </main>
  );
}
