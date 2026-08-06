import { Container } from "@/components/kit/container";
import { Link } from "@/i18n/navigation";
import { appUrl, loginUrl, registerUrl } from "@/lib/app-links";
import type { Locale } from "@/lib/i18n";
import { ROLE_PAGES } from "@/lib/site-map";
import { getTranslations } from "next-intl/server";

export async function SiteFooter({ locale }: { locale: Locale }) {
  const t = await getTranslations("nav");
  const f = await getTranslations("footer");

  const columns = [
    {
      title: f("product"),
      links: ROLE_PAGES.map((p) => ({ href: p.href, label: t(p.navKey), external: false })),
    },
    {
      title: f("resources"),
      links: [
        { href: appUrl("/pricing", locale), label: t("pricing"), external: true },
        { href: appUrl("/help", locale), label: t("help"), external: true },
        { href: appUrl("/faq", locale), label: t("faq"), external: true },
        { href: appUrl("/changelog", locale), label: t("changelog"), external: true },
      ],
    },
    {
      title: f("company"),
      links: [
        { href: appUrl("/contact", locale), label: t("contact"), external: true },
        { href: appUrl("/terms", locale), label: f("terms"), external: true },
        { href: appUrl("/privacy", locale), label: f("privacy"), external: true },
      ],
    },
  ];

  return (
    <footer className="border-t" style={{ borderColor: "var(--rule)" }}>
      <Container className="py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-base font-extrabold" style={{ color: "var(--ink)" }}>
              {locale === "ar" ? "إدورا" : "Edura"}
            </p>
            <p className="mt-2 max-w-xs text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
              {f("tagline")}
            </p>
            <div className="mt-5 flex gap-2">
              <a
                href={registerUrl(locale)}
                className="focus-ledger inline-flex h-9 items-center rounded-(--radius-step-md) px-4 text-sm font-semibold"
                style={{ backgroundColor: "var(--indigo)", color: "var(--indigo-ink)" }}
              >
                {t("register")}
              </a>
              <a
                href={loginUrl(locale)}
                className="focus-ledger inline-flex h-9 items-center rounded-(--radius-step-md) border px-4 text-sm font-semibold"
                style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
              >
                {t("login")}
              </a>
            </div>
          </div>

          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p
                className="text-xs font-bold"
                style={{ color: "var(--ink-3)", wordSpacing: locale === "ar" ? "0.1em" : undefined }}
              >
                {col.title}
              </p>
              <ul className="mt-3 grid gap-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    {l.external ? (
                      <a href={l.href} className="focus-ledger text-sm" style={{ color: "var(--ink-2)" }}>
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} className="focus-ledger text-sm" style={{ color: "var(--ink-2)" }}>
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <p className="mt-12 border-t pt-6 text-xs" style={{ borderColor: "var(--rule)", color: "var(--ink-3)" }}>
          {f("rights")}
        </p>
      </Container>
    </footer>
  );
}
