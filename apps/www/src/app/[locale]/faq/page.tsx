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

// The student group first, then the parent group.
const GROUP_ART: LineArtName[] = ["student", "parent"];

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
      <PageHero
        headline={f.headline}
        lede={f.lede}
        art="question"
        actions={f.groups.map((group, gi) => (
          <a key={group.id} href={`#${group.id}`} className="chip-link">
            <LineArt name={GROUP_ART[gi % GROUP_ART.length]!} className="h-5 w-5" />
            {group.title}
          </a>
        ))}
      />

      {f.groups.map((group, gi) => (
        <Section key={group.id} id={group.id}>
          <div className="faq-column">
            <div data-reveal="" className="flex items-center gap-4">
              <span className="method-icon" data-ground={gi % 2 === 0 ? "pen" : "marker"}>
                <LineArt name={GROUP_ART[gi % GROUP_ART.length]!} className="h-7 w-7" />
              </span>
              <h2 id={`${group.id}-title`} className="t-h2 text-ink">
                {group.title}
              </h2>
            </div>

            <div data-reveal="" className="faq-cards mt-8">
              {group.items.map((item) => (
                <details key={item.q} className="faq-item faq-card">
                  <summary className="faq-q">
                    <span className="min-w-0 flex-1">{item.q}</span>
                    <span className="faq-toggle">
                      <svg
                        viewBox="0 0 16 16"
                        aria-hidden="true"
                        className="faq-icon h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      >
                        <path d="M8 2.5v11M2.5 8h11" />
                      </svg>
                    </span>
                  </summary>
                  <p className="faq-a">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </Section>
      ))}

      <Section id="more">
        <div data-reveal="" className="cta-card">
          <span className="method-icon mx-auto mb-5">
            <LineArt name="mail" className="h-7 w-7" />
          </span>
          <h2 className="t-h2">{f.more.title}</h2>
          <p className="t-lede mx-auto mt-3 max-w-[48ch]">{f.more.body}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href={`/${locale}/contact`} className="btn btn-pen">
              {f.more.contact}
              <Arrow />
            </Link>
            <Link href={`/${locale}/trust`} className="btn btn-quiet">
              {f.more.trust}
            </Link>
          </div>
        </div>
      </Section>
    </PageFrame>
  );
}
