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
  const tr = getPages(locale).trust;

  return {
    title: tr.meta.title,
    description: tr.meta.description,
    alternates: {
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/trust`])),
    },
  };
}

const GROUNDS = ["pen", "marker", "field"] as const;

const GROUP_ART: Record<string, LineArtName> = {
  students: "guardian",
  money: "wallet",
  data: "isolation",
};

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
      <PageHero headline={tr.headline} lede={tr.lede} art="guardian" />

      {tr.groups.map((group, gi) => (
        <Section key={group.id} id={group.id}>
          <div data-reveal="" className="flex items-center gap-4">
            <span className="method-icon" data-ground={GROUNDS[gi % GROUNDS.length]}>
              <LineArt name={GROUP_ART[group.id] ?? "guardian"} className="h-7 w-7" />
            </span>
            <h2 className="t-h2 text-ink">{group.title}</h2>
          </div>
          <ul role="list" data-reveal="" className="cap-grid mt-8" data-cols={group.items.length % 3 === 0 ? "3" : "2"}>
            {group.items.map((item) => (
              <li key={item.title} className="cap-card">
                <span className="cap-icon">
                  <LineArt name="check" className="h-5 w-5" />
                </span>
                <h3 className="cap-name">{item.title}</h3>
                <p className="cap-detail">{item.body}</p>
              </li>
            ))}
          </ul>
        </Section>
      ))}

      <Section id="policies">
        <h2 data-reveal="" className="t-h2">
          {tr.links.title}
        </h2>
        <ul role="list" data-reveal="" className="link-grid mt-8">
          {(
            [
              ["privacy", tr.links.privacy, "isolation"],
              ["terms", tr.links.terms, "register"],
            ] as const
          ).map(([slug, label, art]) => (
            <li key={slug} className="flex">
              <Link href={`/${locale}/${slug}`} className="link-card">
                <span className="method-icon">
                  <LineArt name={art} className="h-7 w-7" />
                </span>
                <span className="t-h3 min-w-0 flex-1 text-ink">{label}</span>
                <Arrow className="row-arrow h-4 w-4" />
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </PageFrame>
  );
}
