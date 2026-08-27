import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageFrame, PageHero } from "@/components/page-frame";
import { Section, SectionBody, SectionTitle } from "@/components/section";
import { LOCALES, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getPages } from "@/i18n/pages";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const tr = getPages(locale).trust;

  return {
    title: tr.meta.title,
    description: tr.meta.description,
    alternates: {
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/trust`])),
    },
  };
}

export default async function TrustPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getMessages(locale);
  const tr = getPages(locale).trust;

  return (
    <PageFrame locale={locale} t={t} activePage="trust">
      <PageHero locale={locale} label={tr.label} headline={tr.headline} lede={tr.lede} />

      {tr.sections.map((section) => (
        <Section key={section.id} id={section.id} label={section.label} locale={locale}>
          <SectionTitle>{section.title}</SectionTitle>
          <SectionBody>{section.body}</SectionBody>
        </Section>
      ))}

      <section className="border-t border-rule">
        <div className="mx-auto w-full max-w-[62rem] px-6 py-10 md:px-10 md:py-16 lg:py-20">
          <h2 className="display text-[1.25rem] leading-snug text-ink">{tr.links.title}</h2>
          <p className="mt-3 max-w-[58ch] text-[0.9375rem] leading-[1.75] text-ink-2">
            {tr.links.body}
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
            <li>
              <Link href={`/${locale}/privacy`} className="rule-link rule-link-row text-[1.0625rem]">
                {tr.links.privacy}
              </Link>
            </li>
            <li>
              <Link href={`/${locale}/terms`} className="rule-link rule-link-row text-[1.0625rem]">
                {tr.links.terms}
              </Link>
            </li>
          </ul>
        </div>
      </section>
    </PageFrame>
  );
}
