import Link from "next/link";

import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import type { RoleSlug } from "@/i18n/roles";
import { appUrl } from "@/lib/app-origin";
import type { NavPath } from "@/lib/routes";

import { LocaleSwitch } from "./locale-switch";
import { Wordmark } from "./mark";
import { ThemeToggle } from "./theme-toggle";

// A plain bar on the page ground with one hairline under it. The mobile menu is
// a no-JS <details>.
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
  const links = [
    { href: `/${locale}#subjects`, label: t.nav.subjects, on: false },
    { href: `/${locale}#how`, label: t.nav.how, on: false },
    { href: `/${locale}/for/parent`, label: t.nav.parents, on: activeRole === "parent" },
    { href: `/${locale}/pricing`, label: t.nav.pages.pricing, on: activePage === "pricing" },
    { href: `/${locale}/faq`, label: t.nav.pages.faq, on: activePage === "faq" },
  ];
  const register = appUrl(locale, "/register?role=student");
  const login = appUrl(locale, "/login");
  const brand = locale === "ar" ? "لينكتك" : "Linktich";

  return (
    <header className="site-nav sticky top-0 z-50 border-b border-rule bg-paper">
      <nav className="wrap flex h-16 items-center gap-3 sm:gap-5">
        <Link href={`/${locale}`} aria-label={brand} className="tap inline-flex shrink-0">
          <Wordmark locale={locale} className="max-[23rem]:[&>span]:sr-only" />
        </Link>

        <ul className="ms-6 hidden items-center gap-7 text-[0.9375rem] xl:flex">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                data-nav-link=""
                {...(link.on ? { "data-active": "", "aria-current": "page" as const } : {})}
                className="rule-link rule-link-row whitespace-nowrap"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ms-auto flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:block">
            <LocaleSwitch locale={locale} label={t.nav.toggleLang} />
          </div>

          <ThemeToggle label={t.nav.toggleTheme} />

          <a
            href={login}
            className="rule-link rule-link-row hidden px-1 text-[0.9375rem] whitespace-nowrap md:inline-flex"
          >
            {t.nav.login}
          </a>

          <a href={register} className="btn btn-pen max-[22rem]:px-3.5">
            {t.nav.cta}
          </a>

          <details className="group/menu xl:hidden" data-mobile-nav="">
            <summary aria-label={t.nav.menu} className="nav-icon-btn cursor-pointer list-none">
              <svg
                viewBox="0 0 20 20"
                aria-hidden="true"
                className="h-4 w-4 group-open/menu:hidden"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M3 7h14M3 13h14" />
              </svg>
              <svg
                viewBox="0 0 20 20"
                aria-hidden="true"
                className="hidden h-4 w-4 group-open/menu:block"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M5 5l10 10M15 5 5 15" />
              </svg>
            </summary>

            <div className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-rule bg-paper">
              <div className="wrap pb-6">
                <ul className="nav-menu-rows">
                  {links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        data-mobile-nav-link=""
                        {...(link.on ? { "data-active": "", "aria-current": "page" as const } : {})}
                        className="nav-menu-link"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <a href={login} className="nav-menu-link">
                      {t.nav.login}
                    </a>
                  </li>
                </ul>

                <div className="mt-5 sm:hidden">
                  <LocaleSwitch locale={locale} label={t.nav.toggleLang} />
                </div>
              </div>
            </div>
          </details>
        </div>
      </nav>
    </header>
  );
}
