import { notFound } from "next/navigation";

import { PageFrame } from "@/components/page-frame";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { Closing } from "@/sections/home/closing";
import { Faq } from "@/sections/home/faq";
import { Figures } from "@/sections/home/figures";
import { Hero } from "@/sections/home/hero";
import { Homes } from "@/sections/home/homes";
import { Pay } from "@/sections/home/pay";
import { Safety } from "@/sections/home/safety";
import { Steps } from "@/sections/home/steps";
import { Subjects } from "@/sections/home/subjects";
import { Teachers } from "@/sections/home/teachers";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getMessages(locale);

  return (
    <PageFrame locale={locale} t={t}>
      <Hero t={t} locale={locale} />
      <Figures t={t} locale={locale} />
      <Subjects t={t} locale={locale} />
      <Teachers t={t} locale={locale} />
      <Steps t={t} locale={locale} />
      <Homes t={t} locale={locale} />
      <Pay t={t} />
      <Safety t={t} locale={locale} />
      <Faq t={t} locale={locale} />
      <Closing t={t} locale={locale} />
    </PageFrame>
  );
}
