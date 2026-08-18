import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageFrame, PageHero } from "@/components/page-frame";
import { LOCALES, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getPages } from "@/i18n/pages";

/**
 * THE FAQ — ten questions, each answered from real system behaviour.
 *
 * Native `<details>` on purpose: the page is static, the browser's own
 * disclosure widget is keyboard- and screen-reader-correct for free, and it
 * works with JavaScript disabled — which is the bar every page on this site
 * holds itself to.
 */

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
  const f = getPages(locale).faq;

  return {
    title: f.meta.title,
    description: f.meta.description,
    alternates: {
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/faq`])),
    },
  };
}

export default async function FaqPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getMessages(locale);
  const f = getPages(locale).faq;

  return (
    <PageFrame locale={locale} t={t} activePage="faq">
      <PageHero locale={locale} label={f.label} headline={f.headline} lede={f.lede} />

      <section className="border-t border-rule">
        <div className="mx-auto w-full max-w-[87.5rem] px-6 py-10 md:px-10 md:py-14 lg:py-20">
          <div className="max-w-[62rem]">
            {f.items.map((item) => (
              <details key={item.q} className="group border-b border-rule">
                <summary className="flex cursor-pointer list-none items-baseline justify-between gap-6 py-5 text-[1.0625rem] leading-snug text-ink [&::-webkit-details-marker]:hidden">
                  <span className="display">{item.q}</span>
                  {/* The marker is typographic, not an icon: a ledger opens a
                      row, it does not animate a chevron. `+` reads in both
                      scripts and both directions. */}
                  <span
                    aria-hidden="true"
                    className="figure text-[1.0625rem] text-ink-3 transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="max-w-[58ch] pb-6 text-[0.9375rem] leading-[1.75] text-ink-2">
                  {item.a}
                </p>
              </details>
            ))}
          </div>

          <div className="mt-14 max-w-[62rem] border-t border-rule pt-8">
            <h2 className="display text-[1.25rem] leading-snug text-ink">{f.more.title}</h2>
            <p className="mt-3 max-w-[58ch] text-[0.9375rem] leading-[1.75] text-ink-2">
              {f.more.body}
            </p>
            <ul className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
              <li>
                <Link href={`/${locale}/pricing`} className="rule-link rule-link-row text-[1.0625rem]">
                  {f.more.pricing}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/trust`} className="rule-link rule-link-row text-[1.0625rem]">
                  {f.more.trust}
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </PageFrame>
  );
}
