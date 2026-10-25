import type { ReactNode } from "react";

import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import type { RoleSlug } from "@/i18n/roles";
import { RISE_BOOTSTRAP } from "@/lib/motion";
import type { NavPath } from "@/lib/routes";

import { LineArt, type LineArtName } from "./line-art";
import { MotionRoot } from "./motion-root";
import { SiteFooter } from "./site-footer";
import { SiteNav } from "./site-nav";

export function PageFrame({
  locale,
  t,
  activePage,
  activeRole,
  children,
  bootScript = true,
}: {
  locale: Locale;
  t: Messages;
  activePage?: NavPath;
  activeRole?: RoleSlug;
  children: ReactNode;
  // A client-rendered page (the 404) cannot run an inline script; MotionRoot covers it.
  bootScript?: boolean;
}) {
  return (
    <>
      <a href="#main" className="skip-link">
        {t.nav.skip}
      </a>

      <SiteNav locale={locale} t={t} activePage={activePage} activeRole={activeRole} />

      <main id="main">{children}</main>

      {/* Starts the hero rise before first paint; see lib/motion. */}
      {bootScript && <script dangerouslySetInnerHTML={{ __html: RISE_BOOTSTRAP }} />}

      <SiteFooter t={t} locale={locale} />

      <MotionRoot />
    </>
  );
}

// An inner page opens calmly and centred: an optional line drawing in a
// tinted circle, one headline, one lede, plenty of air.
export function PageHero({
  headline,
  lede,
  note,
  actions,
  art,
}: {
  locale?: Locale;
  headline: string;
  lede?: string;
  note?: string;
  /** Optional buttons/links under the lede (one primary at most). */
  actions?: ReactNode;
  art?: LineArtName;
}) {
  return (
    <section className="page-intro">
      <div className="wrap page-intro-inner">
        {art ? (
          <span data-rise="" className="page-intro-art" data-ground="pen">
            <LineArt name={art} className="h-10 w-10" />
          </span>
        ) : null}

        <h1 data-rise="" className="t-display text-ink">
          {headline}
        </h1>

        {lede ? (
          <p data-rise="" className="t-lede page-intro-lede">
            {lede}
          </p>
        ) : null}

        {note ? (
          <p data-rise="" className="t-meta mt-4 max-w-[60ch]">
            {note}
          </p>
        ) : null}

        {actions ? (
          <div data-rise="" className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {actions}
          </div>
        ) : null}
      </div>
    </section>
  );
}

// Privacy and terms share one calm reading layout: the contents list sticks
// beside a single readable column on wide screens and folds into a
// disclosure above the text on narrow ones.
export function LegalDoc({
  title,
  updatedLabel,
  updated,
  contentsLabel,
  headings,
  children,
}: {
  title: string;
  updatedLabel: string;
  updated: string;
  contentsLabel: string;
  headings: readonly string[];
  children: ReactNode;
}) {
  const contents = (
    <ol className="doc-toc-list">
      {headings.map((heading, index) => (
        <li key={heading}>
          <a href={`#section-${index + 1}`} className="doc-toc-link">
            {heading}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="legal-doc">
      <header className="wrap pt-16 pb-10 md:pt-24 md:pb-14">
        <h1 data-rise="" className="t-display text-ink">
          {title}
        </h1>
        <p data-rise="" className="t-meta mt-4">
          {updatedLabel}: <span className="figure">{updated}</span>
        </p>
      </header>

      <div className="wrap pb-20 lg:grid lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-16 lg:pb-28">
        <details className="doc-toc-fold lg:hidden">
          <summary className="doc-toc-summary">
            {contentsLabel}
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="doc-toc-chev h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m4 6 4 4 4-4" />
            </svg>
          </summary>
          <nav aria-label={contentsLabel} className="pb-5">
            {contents}
          </nav>
        </details>

        <nav aria-label={contentsLabel} className="hidden lg:block">
          <div className="doc-toc doc-toc-card">
            <p className="t-meta">{contentsLabel}</p>
            {contents}
          </div>
        </nav>

        <div className="legal-copy legal-sheet min-w-0">{children}</div>
      </div>
    </div>
  );
}
