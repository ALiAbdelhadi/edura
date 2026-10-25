import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Arrow } from "@/components/arrow";
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
  const p = getPages(locale).pricing;

  return {
    title: p.meta.title,
    description: p.meta.description,
    alternates: {
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/pricing`])),
    },
  };
}

const PLAN_LOOK: Record<string, { art: LineArtName; ground: "pen" | "marker" | "field" }> = {
  lesson: { art: "attend", ground: "pen" },
  month: { art: "subscribe", ground: "marker" },
};

const METHOD_ART: LineArtName[] = ["card", "cash", "parent-wallet"];

function Check() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="mt-[0.4rem] h-4 w-4 shrink-0 text-pen"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
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
      <PageHero headline={p.headline} lede={p.lede} art="pay" />

      <Section id="plans">
        <h2 className="t-h2 mx-auto text-center">{p.plans.title}</h2>

        <ul role="list" className="plan-grid mt-10 lg:mt-12">
          {p.plans.items.map((plan) => {
            const look = PLAN_LOOK[plan.id] ?? PLAN_LOOK.lesson!;
            return (
              <li key={plan.id} data-reveal="" className="plan-card">
                <div className="plan-head" data-ground={look.ground}>
                  <LineArt name={look.art} className="h-9 w-9" />
                  <h3 className="t-h3 text-ink">{plan.name}</h3>
                </div>

                <div className="plan-price">
                  <p className="plan-price-value">{plan.price}</p>
                  {plan.per ? <p className="t-meta mt-1">{plan.per}</p> : null}
                </div>

                <ul role="list" className="plan-points">
                  {plan.points.map((point) => (
                    <li key={point} className="flex gap-3 text-[0.9375rem] leading-[1.7] text-ink-2">
                      <Check />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>

        <div data-reveal="" className="mt-10 flex flex-col items-center gap-4 text-center">
          <a href={appUrl(locale, "/register?role=student")} className="btn btn-pen">
            {p.plans.primary}
            <Arrow />
          </a>
          <p className="t-meta max-w-[52ch]">{p.plans.note}</p>
        </div>
      </Section>

      <Section id="methods">
        <h2 className="t-h2 mx-auto text-center">{p.methods.title}</h2>
        <ul role="list" data-reveal="" className="method-grid mt-10" data-cols="3">
          {p.methods.items.map((method, i) => (
            <li key={method.title} className="method-card method-card-stack">
              <span className="method-icon">
                <LineArt name={METHOD_ART[i % METHOD_ART.length]!} className="h-7 w-7" />
              </span>
              <span className="min-w-0">
                <h3 className="t-h3 text-ink">{method.title}</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">{method.body}</p>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="more">
        <div data-reveal="" className="cta-card">
          <h2 className="t-h2">{p.more.title}</h2>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href={`/${locale}/faq`} className="btn btn-pen">
              {p.more.faq}
              <Arrow />
            </Link>
            <Link href={`/${locale}/contact`} className="btn btn-quiet">
              {p.more.contact}
            </Link>
          </div>
        </div>
      </Section>
    </PageFrame>
  );
}
