import type { ReactNode } from "react";

import { Eyebrow } from "@repo/ui/components/eyebrow";

import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import type { NavPath } from "@/lib/routes";
import { Ink } from "./ink";
import { MotionRoot } from "./motion-root";
import { SiteFooter } from "./site-footer";
import { SiteNav } from "./site-nav";

export function PageFrame({
  locale,
  t,
  activePage,
  children,
}: {
  locale: Locale;
  t: Messages;
  activePage?: NavPath;
  children: ReactNode;
}) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:m-3 focus:bg-sheet focus:px-4 focus:py-2 focus:text-ink"
      >
        {t.nav.skip}
      </a>

      <SiteNav locale={locale} t={t} activePage={activePage} />

      <main id="main">{children}</main>

      <SiteFooter t={t} locale={locale} />

      <MotionRoot />
    </>
  );
}

export function PageHero({
  locale,
  label,
  headline,
  lede,
  note,
}: {
  locale: Locale;
  label: string;
  headline: string;
  lede: string;
  note?: string;
}) {
  return (
    <section className="mx-auto w-full max-w-[87.5rem] px-6 pt-14 pb-14 md:px-10 lg:pt-20 lg:pb-16">
      <Eyebrow locale={locale} tone="gold">
        {label}
      </Eyebrow>

      <Ink
        as="h1"
        text={headline}
        className="display mt-5 max-w-[18ch] text-[clamp(2.25rem,1.4rem+3.2vw,3.5rem)] leading-[1.15] text-ink"
      />

      <p className="mt-6 max-w-[58ch] text-[1.0625rem] leading-[1.8] text-ink-2">{lede}</p>

      {note ? (
        <p className="mt-4 max-w-[58ch] text-[0.8125rem] leading-relaxed text-ink-3">{note}</p>
      ) : null}
    </section>
  );
}
