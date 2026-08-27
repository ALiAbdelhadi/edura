import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Button } from "@repo/ui/components/button";

import { ContactForm } from "@/components/contact-form";
import { PageFrame, PageHero } from "@/components/page-frame";
import { Section, SectionTitle } from "@/components/section";
import { appUrl } from "@/lib/app-origin";
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
  const c = getPages(locale).contact;

  return {
    title: c.meta.title,
    description: c.meta.description,
    alternates: {
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/contact`])),
    },
  };
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getMessages(locale);
  const c = getPages(locale).contact;

  return (
    <PageFrame locale={locale} t={t}>
      <PageHero locale={locale} label={c.label} headline={c.headline} lede={c.lede} note={c.note} />

      <Section id="routes" label={c.routes.label} locale={locale}>
        <ol className="border-t border-rule">
          {c.routes.items.map((route, index) => (
            <li
              key={route.title}
              className="grid gap-3 border-b border-rule py-7 sm:grid-cols-[2.5rem_1fr] sm:gap-6"
            >
              <span aria-hidden="true" className="figure text-[0.8125rem] text-ink-3">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <h2 className="display text-[1.0625rem] leading-snug text-ink">{route.title}</h2>
                <p className="mt-3 max-w-[58ch] text-[0.9375rem] leading-[1.75] text-ink-2">
                  {route.body}
                </p>
                {route.cta ? (
                  <div className="mt-5">
                    <Button asChild variant="gold" size="ledger" className="tap">
                      <a href={appUrl(locale, "/login")}>{route.cta}</a>
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="reach" label={c.reach.label} locale={locale}>
        <dl className="grid max-w-[62rem] gap-px border border-rule bg-rule sm:grid-cols-2">
          <div className="bg-sheet px-5 py-5 sm:px-6">
            <dt className="text-[0.8125rem] font-semibold text-ink-3">{c.reach.phoneLabel}</dt>
            <dd className="figure mt-2 text-[1.0625rem] text-ink">{c.reach.phone}</dd>
          </div>
          <div className="bg-sheet px-5 py-5 sm:px-6">
            <dt className="text-[0.8125rem] font-semibold text-ink-3">{c.reach.addressLabel}</dt>
            <dd className="mt-2 text-[1.0625rem] text-ink">{c.reach.address}</dd>
          </div>
        </dl>
        <p className="mt-4 max-w-[58ch] text-[0.8125rem] text-ink-3">
          {c.reach.placeholderNote}
        </p>
      </Section>

      <Section id="form" label={c.form.label} locale={locale}>
        <SectionTitle>{c.form.title}</SectionTitle>

        <div className="mt-8 max-w-[62rem] border border-rule bg-sheet p-6 sm:p-7">
          <h3 className="display text-[1.0625rem] leading-snug text-ink">{c.safety.title}</h3>
          <p className="mt-3 max-w-[58ch] text-[0.9375rem] leading-[1.75] text-ink-2">
            {c.safety.body}
          </p>
        </div>

        <div className="mt-10">
          <ContactForm locale={locale} copy={c.form} />
        </div>
      </Section>
    </PageFrame>
  );
}
