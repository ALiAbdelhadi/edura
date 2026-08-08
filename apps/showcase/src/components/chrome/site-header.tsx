"use client";

import { Container } from "@/components/kit/container";
import { Link, usePathname } from "@/i18n/navigation";
import { appUrl, loginUrl, registerUrl } from "@/lib/app-links";
import type { Locale } from "@/lib/i18n";
import { ROLE_PAGES } from "@/lib/site-map";
import { Wordmark } from "@repo/ui/components/wordmark";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

export function SiteHeader() {
  const t = useTranslations("nav");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

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
        // --sheet, not --paper: the bar is a surface laid ON the page, and the
        // hairline under it only reads as an edge if the two sides differ.
        backgroundColor: "color-mix(in oklab, var(--sheet) 88%, transparent)",
      }}
    >
      <a
        href="#content"
        className="focus-ledger sr-only focus:not-sr-only focus:absolute focus:inset-s-4 focus:top-3 focus:z-50 focus:rounded-(--radius-step-sm) focus:px-3 focus:py-2"
        style={{ backgroundColor: "var(--indigo)", color: "var(--indigo-ink)" }}
      >
        {t("skipToContent")}
      </a>

      <Container className="flex h-[60px] items-center justify-between gap-4">
        <Link href="/" className="focus-ledger" aria-label="Edura">
          <Wordmark locale={locale} size={21} />
        </Link>

        <nav aria-label={t("home")} className="hidden items-center gap-1 md:flex">
          {ROLE_PAGES.map((p) => {
            const active = pathname === p.href;
            return (
              <Link
                key={p.href}
                href={p.href}
                aria-current={active ? "page" : undefined}
                // The active page is marked by INK and a gold underline, not by
                // a filled pill: colour is a stroke in this system, and a filled
                // chip in the nav would be the second solid on a surface whose
                // only solid is the primary CTA.
                className="focus-ledger rounded-(--radius-step-sm) px-2.5 py-2 text-[15px] whitespace-nowrap"
                style={{
                  color: active ? "var(--ink)" : "var(--ink-2)",
                  fontWeight: active ? 600 : 400,
                  boxShadow: active ? "inset 0 -2px 0 var(--gold)" : undefined,
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
              className="focus-ledger rounded-(--radius-step-sm) px-2.5 py-2 text-[15px] whitespace-nowrap"
              style={{ color: "var(--ink-2)" }}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={loginUrl(locale)}
            className="focus-ledger hidden rounded-(--radius-step-md) px-3 py-2 text-[15px] whitespace-nowrap sm:inline-flex"
            style={{ color: "var(--ink-2)" }}
          >
            {t("login")}
          </a>
          {/* The one solid button on the page. */}
          <a
            href={registerUrl(locale)}
            className="focus-ledger inline-flex h-[38px] items-center rounded-(--radius-step-md) px-[18px] text-sm font-medium whitespace-nowrap transition-colors hover:bg-ink-2"
            style={{ backgroundColor: "var(--ink)", color: "var(--paper)" }}
          >
            {t("register")}
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? t("closeMenu") : t("openMenu")}
            className="focus-ledger inline-flex h-9 w-9 items-center justify-center rounded-(--radius-step-md) border md:hidden"
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
                className="focus-ledger rounded-(--radius-step-sm) px-3 py-2 text-sm font-medium"
                style={{ color: "var(--ink)" }}
              >
                {t(p.navKey)}
              </Link>
            ))}
            {external.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="focus-ledger rounded-(--radius-step-sm) px-3 py-2 text-sm font-medium"
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
