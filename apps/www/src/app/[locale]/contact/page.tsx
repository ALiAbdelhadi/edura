import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Arrow } from "@/components/arrow";
import { ContactForm } from "@/components/contact-form";
import { LineArt, type LineArtName } from "@/components/line-art";
import { PageFrame, PageHero } from "@/components/page-frame";
import { Section } from "@/components/section";
import { LOCALES, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getPages } from "@/i18n/pages";
import { appUrl } from "@/lib/app-origin";

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

const ROUTE_ART: LineArtName[] = ["register", "student", "mail"];

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
      <PageHero headline={c.headline} lede={c.lede} art="mail" />

      <Section id="routes">
        <h2 data-reveal="" className="t-h2 mx-auto text-center">
          {c.routes.title}
        </h2>
        <ul role="list" data-reveal="" className="method-grid mt-10" data-cols="3">
          {c.routes.items.map((route, i) => {
            const body = (
              <>
                <span className="method-icon">
                  <LineArt name={ROUTE_ART[i % ROUTE_ART.length]!} className="h-7 w-7" />
                </span>
                <span className="min-w-0">
                  <span className="t-h3 block text-ink">{route.title}</span>
                  <span className="mt-2 block text-[0.9375rem] leading-relaxed text-ink-2">{route.body}</span>
                  {route.cta ? (
                    <span className="tile-more">
                      {route.cta}
                      <Arrow />
                    </span>
                  ) : null}
                </span>
              </>
            );
            return route.cta ? (
              <li key={route.title} className="flex">
                <a href={appUrl(locale, "/login")} className="method-card method-card-stack method-card-link">
                  {body}
                </a>
              </li>
            ) : (
              <li key={route.title} className="method-card method-card-stack">
                {body}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section id="form">
        <div data-reveal="" className="card contact-card">
          <h2 id="contact-form-title" className="t-h2 text-ink">
            {c.form.title}
          </h2>

          <div className="contact-safety" data-ground="marker">
            <LineArt name="guardian" className="h-6 w-6 shrink-0 text-pen" />
            <span>
              <span className="block font-medium text-ink">{c.safety.title}</span>
              <span className="mt-1 block text-[0.9375rem] leading-relaxed text-ink-2">{c.safety.body}</span>
            </span>
          </div>

          <div className="mt-8">
            <ContactForm locale={locale} copy={c.form} />
          </div>

          <p className="t-meta mt-6">{c.note}</p>
        </div>
      </Section>
    </PageFrame>
  );
}
