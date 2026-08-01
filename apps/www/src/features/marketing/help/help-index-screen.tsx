import { Container } from "@/components/kit/container";
import { Eyebrow } from "@/components/ledger";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/i18n";
import { formatNumber } from "@/lib/i18n/format";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { MarketingShell } from "../marketing-shell";
import styles from "../marketing.module.css";
import { TrackedCta } from "../tracked-cta";
import { HELP_CATEGORIES, articlesInCategory } from "./articles";
import { loadArticleMeta } from "./load";

export async function HelpIndexScreen({ locale }: { locale: Locale }) {
  const t = await getTranslations("marketing");
  const rtl = locale === "ar";
  const Arrow = rtl ? ArrowLeft : ArrowRight;

  // One read per article, resolved concurrently. This runs at BUILD time (the
  // route is statically generated), so it costs nothing at request time.
  const sections = await Promise.all(
    HELP_CATEGORIES.map(async (category) => ({
      category,
      articles: await Promise.all(
        articlesInCategory(category).map((a) => loadArticleMeta(locale, a.slug)),
      ),
    })),
  );

  return (
    <MarketingShell active="/help">
      <section className="border-b" style={{ borderColor: "var(--rule)" }}>
        <Container className="py-12 sm:py-16">
          <div className="max-w-3xl">
            <Eyebrow>{t("help.hero.eyebrow")}</Eyebrow>
            <h1 className={`${styles.pageTitle} mt-3 font-extrabold`} style={{ color: "var(--ink)" }}>
              {t("help.hero.title")}
            </h1>
            <p className={`${styles.lead} mt-5 max-w-2xl`} style={{ color: "var(--ink-2)" }}>
              {t("help.hero.subtitle")}
            </p>
          </div>
        </Container>
      </section>

      <Container className="py-12 sm:py-14">
        <div className="flex flex-col gap-12">
          {sections.map(({ category, articles }) => (
            <section key={category}>
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-lg font-bold" style={{ color: "var(--ink)" }}>
                  {t(`help.categories.${category}`)}
                </h2>
                <span className="text-xs" style={{ color: "var(--ink-3)" }}>
                  {t("help.articleCount", { n: formatNumber(articles.length, locale) })}
                </span>
              </div>

              <ul className="mt-4 grid gap-3.5 md:grid-cols-2 lg:grid-cols-3">
                {articles.map((a) => (
                  <li key={a.slug}>
                    <Link
                      href={`/help/${a.slug}`}
                      className={`${styles.card} flex h-full flex-col transition-colors hover:border-(--indigo)`}
                    >
                      <h3 className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
                        {a.title}
                      </h3>
                      <p
                        className="mt-2 flex-1 text-[13px] leading-relaxed"
                        style={{ color: "var(--ink-2)" }}
                      >
                        {a.summary}
                      </p>
                      <Arrow
                        className="mt-4 size-4"
                        style={{ color: "var(--indigo)" }}
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className={`${styles.cardMuted} mt-14 text-center`}>
          <h2 className="text-lg font-bold" style={{ color: "var(--ink)" }}>
            {t("help.stillStuck")}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "var(--ink-2)" }}>
            {t("help.stillStuckBody")}
          </p>
          <div className="mt-5 flex justify-center">
            <TrackedCta href="/contact" cta="contact" placement="help_index" className="px-7 py-2.5">
              {t("nav.contact")}
            </TrackedCta>
          </div>
        </div>
      </Container>
    </MarketingShell>
  );
}
