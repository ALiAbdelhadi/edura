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
  activeRole?: RoleSlug;
  activePage?: NavPath;
}) {

  const roles = ROLE_SLUGS.map((slug) => ({
    slug,
    href: `/${locale}/for/${slug}`,
    label: getRolePage(locale, slug).label,
  }));

  const pages = NAV_PATHS.map((path) => ({
    path,
    href: `/${locale}/${path}`,
    label: t.nav.pages[path],
  }));

  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-paper/85 backdrop-blur-md">
      <nav className="mx-auto flex w-full max-w-[87.5rem] items-center gap-6 px-6 py-4 md:px-10">
        <Link href={`/${locale}`} aria-label="Edura" className="tap inline-flex">
          <Wordmark />
        </Link>

        <ul className="hidden flex-nowrap items-center gap-5 text-sm lg:flex xl:gap-7">
          {roles.map((role) => (
            <li key={role.slug}>
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

        <div className="ms-auto flex items-center gap-3">

          <div className="hidden sm:block">
            <LocaleSwitch locale={locale} label={t.nav.toggleLang} />
          </div>

          <ThemeToggle label={t.nav.toggleTheme} />

          <a href={appUrl(locale, "/login")} className="rule-link rule-link-row hidden text-sm sm:inline-flex">
            {t.nav.login}
          </a>

          <Button asChild variant="ledger" size="sm" className="tap">
            <a href={appUrl(locale, "/register?role=center_admin")}>{t.nav.cta}</a>
          </Button>

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
