import { LedgerButton } from "@/components/ledger";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { DemoCta } from "./demo-cta";
import { MarketingMobileNav } from "./marketing-mobile-nav";
import { HEADER_LINKS, demoBookingUrl } from "./nav";
import { TrackedCta } from "./tracked-cta";

export async function MarketingHeader({ active }: { active?: string }) {
  const t = await getTranslations("marketing");
  const demoUrl = demoBookingUrl();

  const links = HEADER_LINKS.map((l) => ({
    href: l.href || "/",
    label: t(`nav.${l.labelKey}`),
  }));

  return (
    <header
      className="sticky top-0 z-30 border-b"
      style={{ borderColor: "var(--rule)", background: "var(--sheet)" }}
    >
      <div className="mx-auto flex w-full max-w-352 items-center justify-between gap-3 px-4 py-3 sm:px-8 md:px-12 lg:px-16">
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/edura-mark.svg"
              alt=""
              width={28}
              height={28}
              loading="eager"
              fetchPriority="high"
              className="shrink-0"
            />
            <span className="truncate text-lg font-bold sm:text-xl" style={{ color: "var(--ink)" }}>
              Edura
            </span>
          </Link>

          <nav aria-label="Edura" className="hidden items-center gap-1 lg:flex">
            {links.map((l) => {
              const isActive = active === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={isActive ? "page" : undefined}
                  className="rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-(--field)"
                  style={{ color: isActive ? "var(--indigo)" : "var(--ink-2)" }}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <Suspense fallback={null}>
            <LanguageSwitcher />
          </Suspense>
          <LedgerButton asChild variant="secondary" className="hidden xl:inline-flex">
            <Link href="/login">{t("nav.login")}</Link>
          </LedgerButton>
          <DemoCta
            url={demoUrl}
            label={t("nav.bookDemo")}
            surface="navbar"
            variant="secondary"
          />
          <TrackedCta href="/register" cta="register" surface="navbar">
            {t("nav.register")}
          </TrackedCta>
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <Suspense fallback={null}>
            <LanguageSwitcher />
          </Suspense>
          <MarketingMobileNav
            links={links}
            loginLabel={t("nav.login")}
            registerLabel={t("nav.register")}
            demoLabel={t("nav.bookDemo")}
            demoUrl={demoUrl}
            menuLabel={t("nav.menu")}
            closeLabel={t("nav.close")}
          />
        </div>
      </div>
    </header>
  );
}
