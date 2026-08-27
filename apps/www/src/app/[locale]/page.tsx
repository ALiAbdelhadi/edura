import { notFound } from "next/navigation";

import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { MotionRoot } from "@/components/motion-root";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/sections/hero";
import { Money } from "@/sections/money";
import { Roles } from "@/sections/roles";
import { Communication } from "@/sections/communication";
import { Counter } from "@/sections/counter";
import { Integrity } from "@/sections/integrity";
import { Closing } from "@/sections/closing";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getMessages(locale);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:m-3 focus:bg-sheet focus:px-4 focus:py-2 focus:text-ink"
      >
        {t.nav.skip}
      </a>

      <SiteNav locale={locale} t={t} />

      <main id="main">
        <Hero t={t} locale={locale} />
        <Money t={t} locale={locale} />
        <Roles t={t} locale={locale} />
        <Counter t={t} locale={locale} />
        <Communication t={t} locale={locale} />
        <Integrity t={t} locale={locale} />
        <Closing t={t} locale={locale} />
      </main>

      <SiteFooter t={t} locale={locale} />

      <MotionRoot />
    </>
  );
}
