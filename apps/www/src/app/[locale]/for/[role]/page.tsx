import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";

import { CapabilityGroup } from "@/components/capability-group";
import { Ink } from "@/components/ink";
import { MotionRoot } from "@/components/motion-root";
import { Plate } from "@/components/plate";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { LOCALES, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { ROLE_SLUGS, getRolePage, isRoleSlug, type RoleSlug } from "@/i18n/roles";
import { appUrl } from "@/lib/app-origin";
import { MEDIA } from "@/media/manifest";

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
    title: `${page.headline} — Linktich`,
    description: page.lede,
    alternates: {
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/for/${role}`])),
    },
  };
}

const APP_CTA: Record<RoleSlug, string> = {
  center: "/register?role=center_admin",
  teacher: "/register?role=teacher",
  parent: "/register?role=parent",
  student: "/register?role=student",
  assistant: "/login",
  staff: "/register?role=center_admin",
};

export default async function RolePage({
  params,
}: {
  params: Promise<{ locale: string; role: string }>;
}) {
  const { locale, role } = await params;
  if (!isLocale(locale) || !isRoleSlug(role)) notFound();

  const t = getMessages(locale);
  const page = getRolePage(locale, role);
  const others = ROLE_SLUGS.filter((slug) => slug !== role);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:m-3 focus:rounded-(--radius-step-sm) focus:bg-sheet focus:px-4 focus:py-2 focus:text-ink"
      >
        {t.nav.skip}
      </a>

      <SiteNav locale={locale} t={t} activeRole={role} />

      <main id="main">
        <section className="mx-auto w-full max-w-[87.5rem] px-6 pt-14 pb-14 md:px-10 lg:pt-20 lg:pb-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_minmax(0,30rem)] lg:gap-16">
            <div>
              <Eyebrow locale={locale} tone="gold">
                {page.label}
              </Eyebrow>

              <Ink
                as="h1"
                text={page.headline}
                className="display mt-5 max-w-[16ch] text-[clamp(2.25rem,1.4rem+3.2vw,3.5rem)] leading-[1.15] text-ink"
              />

              <p className="mt-6 max-w-[54ch] text-[1.0625rem] leading-[1.8] text-ink-2">
                {page.lede}
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Button asChild variant="ledger" size="ledger" className="tap">
                  <a href="#start">{page.ctaPrimary}</a>
                </Button>
                <Button asChild variant="gold" size="ledger" className="tap">
                  <Link href={`/${locale}#money`}>{t.hero.secondary}</Link>
                </Button>
              </div>
            </div>

            <Plate
              slot={MEDIA[page.hero]}
              caption={page.question}
              reservedLabel={t.media.roles}
              locale={locale}
            />
          </div>
        </section>

        <section id="capabilities" className="border-t border-rule">
          <div className="mx-auto w-full max-w-[87.5rem] px-6 pb-8 md:px-10">
            {page.groups.map((group, index) => (
              <CapabilityGroup
                key={group.label}
                group={group}
                locale={locale}
                reservedLabel={t.media.roles}
                index={index}
              />
            ))}
          </div>
        </section>

        <section id="guarantees" className="border-t border-rule">
          <div className="mx-auto w-full max-w-[87.5rem] px-6 py-10 md:px-10 md:py-16 lg:py-20">
            <Eyebrow locale={locale} tone="gold">
              {t.integrity.label}
            </Eyebrow>
            <div className="mt-8 grid gap-x-14 sm:grid-cols-3">
              {page.guarantees.map((guarantee) => (
                <article key={guarantee.title} className="border-t border-rule py-6">
                  <h2 className="display text-[1.0625rem] leading-snug text-ink">
                    {guarantee.title}
                  </h2>
                  <p className="mt-3 max-w-[46ch] text-[0.9375rem] leading-[1.75] text-ink-2">
                    {guarantee.detail}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="start" className="border-t border-rule">
          <div className="mx-auto w-full max-w-[72rem] px-6 py-12 md:px-10 md:py-20 lg:py-28">
            <Ink
              as="h2"
              text={page.ctaTitle}
              className="display max-w-[16ch] text-[clamp(2rem,1.3rem+2.8vw,3.25rem)] leading-[1.2] text-ink"
            />
            <p className="mt-5 max-w-[48ch] text-[1.0625rem] leading-[1.75] text-ink-2">
              {page.ctaBody}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild variant="ledger" size="ledger" className="tap">
                <a href={appUrl(locale, APP_CTA[role])}>{page.ctaPrimary}</a>
              </Button>
            </div>

            <nav className="mt-14 border-t border-rule pt-8">
              <Eyebrow locale={locale} tone="gold">
                {t.roles.label}
              </Eyebrow>
              <ul className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
                {others.map((slug) => (
                  <li key={slug}>
                    <Link href={`/${locale}/for/${slug}`} className="rule-link rule-link-row text-[1.0625rem]">
                      {getRolePage(locale, slug).label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </section>
      </main>

      <SiteFooter t={t} locale={locale} />

      <MotionRoot />
    </>
  );
}
