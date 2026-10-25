import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Arrow } from "@/components/arrow";
import { LineArt } from "@/components/line-art";
import { PageFrame } from "@/components/page-frame";
import { RoleGroup } from "@/components/role-group";
import { RoleShot } from "@/components/role-shot";
import { Section } from "@/components/section";
import { LOCALES, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { ROLE_SLUGS, getRolePage, getRoleUi, isRoleSlug, type RoleSlug } from "@/i18n/roles";
import { appUrl } from "@/lib/app-origin";
import { MEDIA, hasAsset } from "@/media/manifest";

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => ROLE_SLUGS.map((role) => ({ locale, role })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; role: string }>;
}): Promise<Metadata> {
  const { locale, role } = await params;
  if (!isLocale(locale) || !isRoleSlug(role)) return {};
  const page = getRolePage(locale, role);

  return {
    title: `${page.name} — ${getRoleUi(locale).brand}`,
    description: page.lede,
    alternates: {
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/for/${role}`])),
    },
  };
}

const GROUNDS = ["pen", "marker", "field"] as const;

const APP_CTA: Record<RoleSlug, string> = {
  parent: "/register?role=parent",
  student: "/register?role=student",
};

export default async function RolePage({ params }: { params: Promise<{ locale: string; role: string }> }) {
  const { locale, role } = await params;
  if (!isLocale(locale) || !isRoleSlug(role)) notFound();

  const t = getMessages(locale);
  const page = getRolePage(locale, role);
  const ui = getRoleUi(locale);
  const cta = appUrl(locale, APP_CTA[role]);
  const heroSlot = MEDIA[page.hero];
  const heroShown = hasAsset(heroSlot);
  const others = ROLE_SLUGS.filter((slug) => slug !== role);

  return (
    <PageFrame locale={locale} t={t} activeRole={role}>
      <section className="rhero">
        <div className="wrap rhero-grid">
          <div className="min-w-0">
            <h1 data-rise="" className="t-display text-ink">
              {page.headline}
            </h1>
            <p data-rise="" className="t-lede mt-6">
              {page.lede}
            </p>
            <div data-rise="" className="mt-8 flex flex-wrap items-center gap-3">
              <a href={cta} className="btn btn-pen">
                {page.ctaPrimary}
                <Arrow />
              </a>
              <Link href={`/${locale}/faq`} className="btn btn-quiet">
                {ui.question}
              </Link>
            </div>
          </div>

          <div data-rise="" className={`rstage rhero-stage ${heroShown ? "" : "rstage-art"}`} data-ground="pen">
            {heroShown ? (
              <RoleShot slot={heroSlot} alt={page.heroAlt} priority />
            ) : (
              <LineArt name={role} className="rstage-icon" />
            )}
          </div>
        </div>
      </section>

      {page.groups.map((group, i) => (
        <RoleGroup key={group.title} id={`group-${i + 1}`} group={group} ground={GROUNDS[(i + 1) % GROUNDS.length]!} />
      ))}

      <Section id="guarantees">
        <h2 data-reveal="" className="t-h2 max-w-[40rem]">
          {ui.guaranteesTitle}
        </h2>
        <ul role="list" className="tile-grid mt-10" data-cols="3" data-reveal="">
          {page.guarantees.map((g) => (
            <li key={g.title} className="promise-card">
              <span className="method-icon">
                <LineArt name="guardian" className="h-7 w-7" />
              </span>
              <h3 className="t-h3 mt-5">{g.title}</h3>
              <p className="cap-detail">{g.detail}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="others">
        <h2 data-reveal="" className="t-h2">
          {ui.others}
        </h2>
        <ul role="list" className="mt-8 grid max-w-[40rem] gap-3" data-reveal="">
          {others.map((slug, i) => {
            const other = getRolePage(locale, slug);
            return (
              <li key={slug} className="flex">
                <Link href={`/${locale}/for/${slug}`} className="link-card">
                  <span className="method-icon" data-ground={GROUNDS[(i + 1) % GROUNDS.length]}>
                    <LineArt name={slug} className="h-7 w-7" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-h3 block text-ink">{other.label}</span>
                    <span className="mt-1 block text-[0.9375rem] leading-relaxed text-ink-2">{other.headline}</span>
                  </span>
                  <Arrow className="row-arrow h-4 w-4" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section id="start" tone="band">
        <div data-reveal="" className="rcta">
          <h2 className="t-h2">{page.ctaTitle}</h2>
          <p className="rcta-body mt-4">{page.ctaBody}</p>
          <a href={cta} className="btn btn-pen mt-8">
            {page.ctaPrimary}
            <Arrow />
          </a>
        </div>
      </Section>
    </PageFrame>
  );
}
