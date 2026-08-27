import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Button } from "@repo/ui/components/button";

import { PageFrame, PageHero } from "@/components/page-frame";
import { Section, SectionBody, SectionTitle } from "@/components/section";
import { SettlementRegister } from "@/components/settlement-register";
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
  const p = getPages(locale).pricing;

  return {
    title: p.meta.title,
    description: p.meta.description,
    alternates: {
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/pricing`])),
    },
  };
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getMessages(locale);
  const p = getPages(locale).pricing;

  return (
    <PageFrame locale={locale} t={t} activePage="pricing">
      <PageHero
        locale={locale}
        label={p.label}
        headline={p.headline}
        lede={p.lede}
        note={p.note}
      />

      <Section id="rules" label={p.rules.label} locale={locale}>
        <SectionTitle>{p.rules.title}</SectionTitle>
        <div className="mt-8 grid gap-x-14 sm:grid-cols-3">
          {p.rules.items.map((rule) => (
            <article key={rule.title} className="border-t border-rule py-6">
              <h3 className="display text-[1.0625rem] leading-snug text-ink">{rule.title}</h3>
              <p className="mt-3 max-w-[46ch] text-[0.9375rem] leading-[1.75] text-ink-2">
                {rule.body}
              </p>
            </article>
          ))}
        </div>
      </Section>

      <Section id="example" label={p.example.label} locale={locale}>
        <SectionTitle>{p.example.title}</SectionTitle>
        <SectionBody>{p.example.body}</SectionBody>

        <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-16">
          <SettlementRegister t={t} locale={locale} />

          <div className="grid gap-8">
            {[p.example.teacherDirect, p.example.perStudent].map((shape) => (
              <article key={shape.title} className="border-t border-rule pt-6">
                <h3 className="display text-[1.0625rem] leading-snug text-ink">{shape.title}</h3>
                <p className="mt-3 max-w-[52ch] text-[0.9375rem] leading-[1.75] text-ink-2">
                  {shape.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </Section>

      <Section id="timing" label={p.timing.label} locale={locale}>
        <SectionTitle>{p.timing.title}</SectionTitle>
        <div className="mt-8 grid gap-x-14 sm:grid-cols-3">
          {p.timing.items.map((item) => (
            <article key={item.title} className="border-t border-rule py-6">
              <h3 className="display text-[1.0625rem] leading-snug text-ink">{item.title}</h3>
              <p className="mt-3 max-w-[46ch] text-[0.9375rem] leading-[1.75] text-ink-2">
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </Section>

      <Section id="no-hidden" label={p.noHidden.label} locale={locale}>
        <SectionTitle>{p.noHidden.title}</SectionTitle>
        <ul className="mt-8 max-w-[58ch]">
          {p.noHidden.items.map((item) => (
            <li
              key={item}
              className="border-t border-rule py-4 text-[0.9375rem] leading-[1.75] text-ink-2"
            >
              {item}
            </li>
          ))}
        </ul>
      </Section>

      <section className="border-t border-rule">
        <div className="mx-auto w-full max-w-[72rem] px-6 py-12 md:px-10 md:py-20 lg:py-24">
          <h2 className="display max-w-[16ch] text-[clamp(2rem,1.3rem+2.8vw,3.25rem)] leading-[1.2] text-ink">
            {p.cta.title}
          </h2>
          <p className="mt-5 max-w-[48ch] text-[1.0625rem] leading-[1.75] text-ink-2">
            {p.cta.body}
          </p>
          <div className="mt-9">
            <Button asChild variant="ledger" size="ledger" className="tap">
              <a href={`/${locale}#closing`}>{p.cta.primary}</a>
            </Button>
          </div>
        </div>
      </section>
    </PageFrame>
  );
}
