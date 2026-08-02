import { Num } from "@/components/ledger";
import { Container } from "@/components/kit/container";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { footerColumn } from "./nav";

const COLUMNS = ["product", "resources", "company"] as const;

/**
 * The public footer. Its link columns are DERIVED from MARKETING_LINKS, so a
 * page added to the nav table is in the footer and the sitemap without a second
 * edit — the drift that left /terms reachable only from the landing page.
 *
 * The year is rendered through <Num> because every figure in this system is set
 * in the mono face, and because Arabic-Indic digits must not resolve for it.
 */
export async function MarketingFooter() {
  const t = await getTranslations("marketing");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t" style={{ borderColor: "var(--rule)", background: "var(--sheet)" }}>
      <Container className="py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div>
            <div className="flex items-center gap-2.5">
              <Image src="/edura-mark.svg" alt="" width={24} height={24} />
              <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>
                Edura
              </span>
            </div>
            <p className="mt-3 max-w-[40ch] text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
              {t("footer.tagline")}
            </p>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col} aria-label={t(`footer.col.${col}`)}>
              <h2
                className="text-xs font-semibold tracking-wide"
                style={{ color: "var(--ink)" }}
              >
                {t(`footer.col.${col}`)}
              </h2>
              <ul className="mt-3 space-y-2">
                {footerColumn(col).map((l) => (
                  <li key={l.href || "/"}>
                    <Link
                      href={l.href || "/"}
                      className="text-[13px] transition-colors hover:text-(--indigo)"
                      style={{ color: "var(--ink-2)" }}
                    >
                      {t(`nav.${l.labelKey}`)}
                    </Link>
                  </li>
                ))}
                {col === "company" ? (
                  <>
                    <li>
                      <Link
                        href="/login"
                        className="text-[13px] transition-colors hover:text-(--indigo)"
                        style={{ color: "var(--ink-2)" }}
                      >
                        {t("nav.login")}
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/register"
                        className="text-[13px] transition-colors hover:text-(--indigo)"
                        style={{ color: "var(--ink-2)" }}
                      >
                        {t("nav.register")}
                      </Link>
                    </li>
                  </>
                ) : null}
              </ul>
            </nav>
          ))}
        </div>

        <div
          className="mt-10 flex flex-col gap-2 border-t pt-6 text-xs sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: "var(--rule)", color: "var(--ink-3)" }}
        >
          <span>
            © <Num>{year}</Num> Edura
          </span>
          <span>{t("footer.madeIn")}</span>
        </div>
      </Container>
    </footer>
  );
}
