import { Container } from "@/components/kit/container";
import { Eyebrow } from "@/components/ledger";
import { getTranslations } from "next-intl/server";
import { FaqList } from "./faq-list";
import { MarketingShell } from "./marketing-shell";
import styles from "./marketing.module.css";
import { TrackedCta } from "./tracked-cta";

const QUESTIONS = [
  ["q1", "a1"],
  ["q2", "a2"],
  ["q3", "a3"],
  ["q4", "a4"],
  ["q5", "a5"],
  ["q6", "a6"],
  ["q7", "a7"],
  ["q8", "a8"],
  ["q9", "a9"],
  ["q10", "a10"],
] as const;

export async function FaqScreen() {
  const t = await getTranslations("marketing");

  const items = QUESTIONS.map(([q, a]) => ({
    id: q,
    question: t(`faq.items.${q}`),
    answer: t(`faq.items.${a}`),
  }));

  return (
    <MarketingShell active="/faq">
      <section className="border-b" style={{ borderColor: "var(--rule)" }}>
        <Container className="py-12 sm:py-14">
          <div className="max-w-2xl">
            <Eyebrow>{t("faq.hero.eyebrow")}</Eyebrow>
            <h1 className={`${styles.pageTitle} mt-3 font-extrabold`} style={{ color: "var(--ink)" }}>
              {t("faq.hero.title")}
            </h1>
            <p className={`${styles.lead} mt-4`} style={{ color: "var(--ink-2)" }}>
              {t("faq.hero.subtitle")}
            </p>
          </div>
        </Container>
      </section>

      <Container className="py-12 sm:py-14">
        <div className="mx-auto max-w-[48rem]">
          <FaqList items={items} />

          <div className={`${styles.cardMuted} mt-12 text-center`}>
            <h2 className="text-lg font-bold" style={{ color: "var(--ink)" }}>
              {t("faq.moreTitle")}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "var(--ink-2)" }}>
              {t("faq.moreBody")}
            </p>
            <div className="mt-5 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <TrackedCta href="/help" cta="help" surface="faq" className="px-7 py-2.5">
                {t("nav.help")}
              </TrackedCta>
              <TrackedCta
                href="/contact"
                cta="contact"
                surface="faq"
                variant="secondary"
                className="px-7 py-2.5"
              >
                {t("nav.contact")}
              </TrackedCta>
            </div>
          </div>
        </div>
      </Container>
    </MarketingShell>
  );
}
