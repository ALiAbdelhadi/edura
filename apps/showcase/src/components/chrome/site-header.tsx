"use client";

import { Container } from "@/components/kit/container";
import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import { appUrl, loginUrl, registerUrl } from "@/lib/app-links";
import { ROLE_PAGES } from "@/lib/site-map";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { Locale } from "@/lib/i18n";

/**
 * The showcase's own header.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * ----------------------------------------------------------------------------
 * It does not reproduce apps/www's marketing nav. `MARKETING_LINKS` there is the
 * single table driving www's header, footer and sitemap, precisely so a page
 * cannot be navigable and missing from search. This site links INTO those pages
 * (pricing, help, FAQ, contact) as absolute cross-origin URLs and owns only its
 * own role pages. Two tables would be two sources of truth for one nav.
 */
export function SiteHeader() {
  const t = useTranslations("nav");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Links into the main app. Absolute, because the showcase is on its own
  // subdomain and a next-intl <Link> would resolve against this app.
  const external = [
    { href: appUrl("/pricing", locale), label: t("pricing") },
    { href: appUrl("/help", locale), label: t("help") },
    { href: appUrl("/faq", locale), label: t("faq") },
  ];

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur"
      style={{
        borderColor: "var(--rule)",
        backgroundColor: "color-mix(in oklab, var(--paper) 88%, transparent)",
      }}
    >
      <a
        href="#content"
        className="focus-ledger sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-3 focus:z-50 focus:rounded-[var(--radius-step-sm)] focus:px-3 focus:py-2"
        style={{ backgroundColor: "var(--indigo)", color: "var(--indigo-ink)" }}
      >
        {t("skipToContent")}
      </a>

      <Container className="flex h-14 items-center justify-between gap-4">
        <Link href="/" className="focus-ledger text-base font-extrabold" style={{ color: "var(--ink)" }}>
          {locale === "ar" ? "إدورا" : "Edura"}
        </Link>

        <nav aria-label={t("home")} className="hidden items-center gap-1 md:flex">
          {ROLE_PAGES.map((p) => {
            const active = pathname === p.href;
            return (
              <Link
                key={p.href}
                href={p.href}
                aria-current={active ? "page" : undefined}
                className="focus-ledger rounded-[var(--radius-step-sm)] px-3 py-2 text-sm font-medium"
                style={{
                  color: active ? "var(--indigo)" : "var(--ink-2)",
                  backgroundColor: active ? "var(--indigo-soft)" : "transparent",
                }}
              >
                {t(p.navKey)}
              </Link>
            );
          })}
          <span aria-hidden className="mx-2 h-4 w-px" style={{ backgroundColor: "var(--rule)" }} />
          {external.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="focus-ledger rounded-[var(--radius-step-sm)] px-3 py-2 text-sm font-medium"
              style={{ color: "var(--ink-2)" }}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={loginUrl(locale)}
            className="focus-ledger hidden rounded-[var(--radius-step-md)] px-3 py-2 text-sm font-semibold sm:inline-flex"
            style={{ color: "var(--ink)" }}
          >
            {t("login")}
          </a>
          <a
            href={registerUrl(locale)}
            className="focus-ledger inline-flex h-9 items-center rounded-[var(--radius-step-md)] px-4 text-sm font-semibold"
            style={{ backgroundColor: "var(--indigo)", color: "var(--indigo-ink)" }}
          >
            {t("register")}
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? t("closeMenu") : t("openMenu")}
            className="focus-ledger inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-step-md)] border md:hidden"
            style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
          >
            <span aria-hidden>{open ? "✕" : "☰"}</span>
          </button>
        </div>
      </Container>

      {open ? (
        <div className="border-t md:hidden" style={{ borderColor: "var(--rule)" }}>
          <Container className="grid gap-1 py-3">
            {ROLE_PAGES.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                onClick={() => setOpen(false)}
                className="focus-ledger rounded-[var(--radius-step-sm)] px-3 py-2 text-sm font-medium"
                style={{ color: "var(--ink)" }}
              >
                {t(p.navKey)}
              </Link>
            ))}
            {external.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="focus-ledger rounded-[var(--radius-step-sm)] px-3 py-2 text-sm font-medium"
                style={{ color: "var(--ink-2)" }}
              >
                {l.label}
              </a>
            ))}
          </Container>
        </div>
      ) : null}
    </header>
  );
}
