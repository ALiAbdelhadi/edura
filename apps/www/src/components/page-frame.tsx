import type { ReactNode } from "react";

import { Eyebrow } from "@repo/ui/components/eyebrow";

import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import type { NavPath } from "@/lib/routes";
import { Ink } from "./ink";
import { MotionRoot } from "./motion-root";
import { SiteFooter } from "./site-footer";
import { SiteNav } from "./site-nav";

/**
 * The frame every standalone page shares — skip link, header, footer, and the
 * motion root. The landing and the role pages predate this component and keep
 * their inline copies; the five standalone pages (pricing, FAQ, trust,
 * privacy, terms) were about to become five more copies, which is where
 * repetition turns into drift.
 */
export function PageFrame({
  locale,
  t,
  activePage,
  children,
}: {
  locale: Locale;
  t: Messages;
  /** Marks this page's own link in the header. The legal pages pass nothing —
   *  they are not in the nav, so there is no link of theirs to mark. */
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

      {/* Renders nothing. These pages have no register to settle, so the hero
          timeline no-ops; what still applies is the headline inking in and the
          fonts-ready refresh. */}
      <MotionRoot />
    </>
  );
}

/** The standalone pages' hero: label, headline, lede — the role pages' shape
 *  without the media column, because none of these pages has a screenshot
 *  that would earn the space. */
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
