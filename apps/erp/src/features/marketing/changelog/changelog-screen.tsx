import { Container } from "@/components/kit/container";
import { Chip, DateText, Eyebrow, Num } from "@/components/ledger";
import type { Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/i18n/format";
import { getTranslations } from "next-intl/server";
import { MarketingShell } from "../marketing-shell";
import styles from "../marketing.module.css";
import { CHANGELOG, type ChangelogTag } from "./entries";

/** Ledger chip tones, mapped once. Colour carries meaning here, not decoration. */
const TAG_TONE: Record<ChangelogTag, "indigo" | "teal" | "amber" | "red"> = {
  feature: "indigo",
  improvement: "teal",
  fix: "amber",
  security: "red",
};

export async function ChangelogScreen({ locale }: { locale: Locale }) {
  const t = await getTranslations("marketing");

  return (
    <MarketingShell active="/changelog">
      <section className="border-b" style={{ borderColor: "var(--rule)" }}>
        <Container className="py-12 sm:py-14">
          <div className="max-w-2xl">
            <Eyebrow>{t("changelog.hero.eyebrow")}</Eyebrow>
            <h1 className={`${styles.pageTitle} mt-3 font-extrabold`} style={{ color: "var(--ink)" }}>
              {t("changelog.hero.title")}
            </h1>
            <p className={`${styles.lead} mt-4`} style={{ color: "var(--ink-2)" }}>
              {t("changelog.hero.subtitle")}
            </p>
          </div>
        </Container>
      </section>

      <Container className="py-12 sm:py-14">
        <div className="mx-auto max-w-[48rem]">
          {CHANGELOG.length === 0 ? (
            <p className="py-10 text-center text-sm" style={{ color: "var(--ink-3)" }}>
              {t("changelog.empty")}
            </p>
          ) : (
            <ol className="flex flex-col gap-3.5">
              {CHANGELOG.map((entry, i) => (
                <li key={`${entry.date}-${i}`} className={styles.card}>
                  <div className="flex flex-wrap items-center gap-3">
                    {/* A date is data: mono face, Latin digits, isolated from
                        the surrounding Arabic by <Num>. */}
                    <DateText className="text-xs" style={{ color: "var(--ink-3)" }}>
                      {formatDate(entry.date, locale, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </DateText>
                    <Chip tone={TAG_TONE[entry.tag]}>{t(`changelog.tag.${entry.tag}`)}</Chip>
                  </div>
                  <h2 className="mt-3 text-[16px] font-bold" style={{ color: "var(--ink)" }}>
                    {entry.title[locale]}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                    {entry.body[locale]}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Container>
    </MarketingShell>
  );
}
