import Link from "next/link";

import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { ROLE_SLUGS, getRolePage, type RoleSlug } from "@/i18n/roles";
import { appUrl } from "@/lib/app-origin";
import { NAV_PATHS, type NavPath } from "@/lib/routes";
import { Button } from "@repo/ui/components/button";

import { LocaleSwitch } from "./locale-switch";
import { Wordmark } from "./mark";
import { ThemeToggle } from "./theme-toggle";

export function SiteNav({
  locale,
  t,
  activeRole,
  activePage,
}: {
  locale: Locale;
  t: Messages;
  /** Set by a role page so its own link carries the gold rule. */
  activeRole?: RoleSlug;
  /** The same, for the three marketing pages. */
  activePage?: NavPath;
}) {
  /* THE NAV CARRIES THE FIVE ROLE PAGES, not the landing's section anchors.

     The anchors were a latent bug the role pages exposed: this header renders
     on every page, and `#money` only exists on the landing — from
     `/ar/for/teacher` those links went nowhere. Real routes work from
     everywhere, and they are the site's actual information architecture; the
     landing's sections are one scroll away, and its hero already points at
     `#money` for the reader who wants the argument. */
  const roles = ROLE_SLUGS.map((slug) => ({
    slug,
    href: `/${locale}/for/${slug}`,
    label: getRolePage(locale, slug).label,
  }));

  /* TWO GROUPS, NOT EIGHT LINKS.

     The role pages answer "which of these is me?"; pricing, the FAQ and the
     guarantees answer "what does it cost, what do I still not understand, and
     can I trust you?" — a different question, asked at a different point. Run
     together as one row of eight they read as an undifferentiated list and the
     reader scans all of it to find either. The hairline between them is the
     same device the rest of the site uses to separate accounts in a register,
     and it costs one element.

     Legal is NOT here — see `LEGAL_PATHS` in lib/routes.ts. */
  const pages = NAV_PATHS.map((path) => ({
    path,
    href: `/${locale}/${path}`,
    label: t.nav.pages[path],
  }));

  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-paper/85 backdrop-blur-md">
      <nav className="mx-auto flex w-full max-w-[87.5rem] items-center gap-6 px-6 py-4 md:px-10">
        {/* The wordmark is a link home, so it is a touch target too — and at
            30px tall it was the smallest one in the header. `.tap` gives it a
            44px area without making the mark any bigger. */}
        <Link href={`/${locale}`} aria-label="Edura" className="tap inline-flex">
          <Wordmark />
        </Link>

        {/* MEASURED, not guessed. Eight links do not fit at 1024px: with the
            links allowed to squeeze, each English label broke internally
            ("For / centers") and those items rendered 40px tall against 20px
            for the rest; with `whitespace-nowrap` stopping that, the row
            overflowed the page by 51px instead. Both are worse than the third
            option, which is what this does — the ROLE links keep appearing at
            `lg` exactly as they always have, and the marketing group joins
            them at `xl`, where it was measured to fit with room to spare.
            So no width loses a link it used to have; some widths simply gain
            three later. Below that the footer carries all of them, on every
            page. */}
        <ul className="hidden flex-nowrap items-center gap-5 text-sm lg:flex xl:gap-7">
          {roles.map((role) => (
            <li key={role.slug}>
              {/* The active page's link carries the SAME gold rule the hover
                  draws — one gesture, two causes — set statically here rather
                  than by a scroll observer, because "which PAGE am I on" is a
                  fact the server already knows. */}
              <Link
                href={role.href}
                data-nav-link=""
                {...(activeRole === role.slug
                  ? { "data-active": "", "aria-current": "page" as const }
                  : {})}
                className="rule-link rule-link-row whitespace-nowrap"
              >
                {role.label}
              </Link>
            </li>
          ))}

          {/* The rule between the two groups. `aria-hidden` and presentational:
              it separates them for the eye, and a screen reader already has the
              list structure it needs. */}
          <li aria-hidden="true" className="hidden h-4 w-px bg-rule xl:block" />

          {pages.map((page) => (
            <li key={page.path} className="hidden xl:block">
              <Link
                href={page.href}
                data-nav-link=""
                {...(activePage === page.path
                  ? { "data-active": "", "aria-current": "page" as const }
                  : {})}
                className="rule-link rule-link-row whitespace-nowrap"
              >
                {page.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* 12px, not 8px. These chips carry 44px hit areas over 36px boxes, so
            an 8px gap would let two targets overlap and a thumb aimed at the
            language switch would toggle the theme. */}
        <div className="ms-auto flex items-center gap-3">
          {/* The language switch is a toggle to the other locale, and it is
              labelled in the language it switches TO — a reader who cannot
              read the current language has to be able to read the way out.

              MEASURED: at 320px the Arabic header had 25px of free space, and
              the menu button needs 48 with its gap. Something had to give, and
              between "you can switch language" and "you can navigate the site
              at all", navigation wins — so below `sm` the chip moves INTO the
              menu panel rather than off the site. It is rendered there
              unconditionally, so the panel is complete on its own. */}
          <div className="hidden sm:block">
            <LocaleSwitch locale={locale} label={t.nav.toggleLang} />
          </div>

          <ThemeToggle label={t.nav.toggleTheme} />

          <a href={appUrl(locale, "/login")} className="rule-link rule-link-row hidden text-sm sm:inline-flex">
            {t.nav.login}
          </a>

          {/* The primary action stays on screen at every width, only tighter.
              `size="sm"` rather than `ledger` ON PURPOSE: in this row the
              button is a peer of two 36px chips, and the full-size variant put
              three different heights in one five-element row. It keeps the
              compact box and takes its 44px target from `.tap`, like they do —
              the page's real CTAs downpage use `size="ledger"`. */}
          <Button asChild variant="ledger" size="sm" className="tap">
            <a href={appUrl(locale, "/register?role=center_admin")}>{t.nav.cta}</a>
          </Button>

          {/* ── THE MOBILE MENU ────────────────────────────────────────────
              Below `lg` this site had NO navigation at all — the link list is
              `hidden lg:flex` and nothing replaced it, so a phone got the
              wordmark, two chips and a button. Every page was reachable only
              from the footer.

              A NATIVE `<details>`, not a client component with `useState`.
              Three things fall out of that and none of them is a nicety here:
              it costs zero JavaScript on a marketing site whose every section
              is a server component; the browser gives the disclosure semantics
              (`aria-expanded`, Enter/Space, focus order) correctly and for
              free; and IT WORKS WITH JAVASCRIPT DISABLED — which is the
              difference between "the menu does not open" and "the site cannot
              be navigated", and is an invariant this site already holds itself
              to and asserts. The FAQ's questions are the same mechanism.

              It does not close on outside-click, and that is the accepted cost
              of the trade: every item in it is a link, so the next thing the
              reader does unmounts the whole document anyway. */}
          {/* `xl:hidden`, NOT `lg:hidden`, and the extra breakpoint is the
              point. The inline row only gains the marketing group at `xl`
              (it does not fit before — measured above), so had this button
              stopped at `lg` there would be a 1024–1279px band where pricing,
              the FAQ and the guarantees appeared in NEITHER the row nor a
              menu, reachable only from the footer. Between 1024 and 1279 the
              five role links therefore appear twice, inline and inside the
              closed panel; that redundancy is invisible and costs nothing,
              whereas the gap was a real hole. The invariant this buys:
              EVERY nav destination is reachable from the header at EVERY
              width, which is asserted rather than left to the reader. */}
          <details className="group/menu xl:hidden" data-mobile-nav="">
            <summary
              aria-label={t.nav.menu}
              className="tap grid h-9 w-9 cursor-pointer list-none place-items-center rounded-(--radius-step-sm) border border-rule text-ink-2 transition-colors hover:border-gold hover:text-ink [&::-webkit-details-marker]:hidden"
            >
              <svg
                viewBox="0 0 20 20"
                aria-hidden="true"
                className="h-4 w-4 group-open/menu:hidden"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              >
                <path d="M3 5.5h14M3 10h14M3 14.5h14" />
              </svg>
              <svg
                viewBox="0 0 20 20"
                aria-hidden="true"
                className="hidden h-4 w-4 group-open/menu:block"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              >
                <path d="M5 5l10 10M15 5 5 15" />
              </svg>
            </summary>

            {/* `bg-paper`, NOT the bar's `bg-paper/85`. The header can be
                translucent because it is a 69px strip; a full panel of links
                over a scrolling page behind it is unreadable at any blur.

                `max-h`/`overflow-y-auto` because nine rows do not fit a phone
                in landscape, and a menu whose last item is unreachable is
                worse than one that scrolls. */}
            <div className="absolute inset-x-0 top-full max-h-[calc(100dvh-4.5rem)] overflow-y-auto border-b border-rule bg-paper">
              <div className="mx-auto w-full max-w-[87.5rem] px-6 pb-4 md:px-10">
                <ul>
                  {[...roles.map((r) => ({ href: r.href, label: r.label, on: activeRole === r.slug })),
                    ...pages.map((p) => ({ href: p.href, label: p.label, on: activePage === p.path }))].map(
                    (item, i) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          data-mobile-nav-link=""
                          {...(item.on ? { "data-active": "", "aria-current": "page" as const } : {})}
                          /* The gold marks the current page as a STROKE at the
                             inline start — the system's own device — rather
                             than the underline the desktop row uses, which
                             would sit on top of the row's own hairline. Logical
                             `border-s` so it flips with direction.

                             The group break is a heavier top rule on the first
                             marketing item, which is the same separation the
                             desktop row draws, in the form a stacked list can
                             carry. */
                          className={`flex items-center border-s-2 border-transparent py-3.5 ps-3 text-[0.9375rem] text-ink-2 transition-colors data-[active]:border-gold data-[active]:text-ink ${
                            i === roles.length ? "border-t border-t-rule" : ""
                          }`}
                        >
                          {item.label}
                        </Link>
                      </li>
                    ),
                  )}
                </ul>

                {/* Sign in and the language switch. Both vanish from the bar on
                    a narrow phone (`hidden sm:inline-flex` / `hidden sm:block`
                    above), so without them here they would be unreachable on
                    exactly the screens this panel exists for. */}
                <div className="mt-4 flex items-center gap-3 border-t border-rule pt-4">
                  <a
                    href={appUrl(locale, "/login")}
                    className="tap inline-flex h-9 items-center text-[0.9375rem] text-ink-2 transition-colors hover:text-ink"
                  >
                    {t.nav.login}
                  </a>
                  <div className="ms-auto sm:hidden">
                    <LocaleSwitch locale={locale} label={t.nav.toggleLang} />
                  </div>
                </div>
              </div>
            </div>
          </details>
        </div>
      </nav>
    </header>
  );
}
