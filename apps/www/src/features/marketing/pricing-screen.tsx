import { Container } from "@/components/kit/container";
import { Eyebrow, Num } from "@/components/ledger";
import type { Locale } from "@/lib/i18n";
import { formatEGP, formatNumber, formatPercent } from "@/lib/i18n/format";
import { getPricingExamples } from "@/lib/services/pricing/public-rates";
import {
  Banknote,
  CreditCard,
  Landmark,
  Lock,
  Receipt,
  Snowflake,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DemoCta } from "./demo-cta";
import { MarketingShell } from "./marketing-shell";
import styles from "./marketing.module.css";
import { demoBookingUrl } from "./nav";
import { TrackedCta } from "./tracked-cta";

/**
 * «إزاي بنحاسب» — the commission model, in numbers.
 *
 * Every figure below comes from `getPricingExamples()`, which reads the live
 * `commission_settings` global row and runs the SETTLEMENT ENGINE'S OWN pure
 * functions over it. Nothing on this page is a number someone typed into a
 * translation file: the copy holds sentences, the server holds arithmetic.
 * That is the whole design — a marketing page that can go stale about money is
 * worse than no page at all.
 */
export async function PricingScreen({ locale }: { locale: Locale }) {
  const t = await getTranslations("marketing");
  const { rates, teacherDirect, hallSplit, flatFee } = await getPricingExamples();
  const demoUrl = demoBookingUrl();

  const egp = (piasters: number) => formatEGP(piasters, locale, { decimals: false });
  const pct = (bp: number) => formatPercent(bp / 100, locale);

  return (
    <MarketingShell active="/pricing">
      {/* Hero */}
      <section className="border-b" style={{ borderColor: "var(--rule)" }}>
        <Container className="py-12 sm:py-16">
          <div className="max-w-3xl">
            <Eyebrow>{t("pricing.hero.eyebrow")}</Eyebrow>
            <h1 className={`${styles.pageTitle} mt-3 font-extrabold`} style={{ color: "var(--ink)" }}>
              {t("pricing.hero.title")}
            </h1>
            <p className={`${styles.lead} mt-5 max-w-2xl`} style={{ color: "var(--ink-2)" }}>
              {t("pricing.hero.subtitle")}
            </p>
            <p className="mt-4 text-xs" style={{ color: "var(--ink-3)" }}>
              {t("pricing.hero.note")}
            </p>
          </div>
        </Container>
      </section>

      {/* The three rules */}
      <section style={{ background: "var(--sheet)" }} className="border-b">
        <Container className="py-14 sm:py-16">
          <SectionHead eyebrow={t("pricing.principles.eyebrow")} title={t("pricing.principles.title")} />
          <div className="mt-9 grid gap-3.5 md:grid-cols-3">
            <Principle
              icon={Receipt}
              title={t("pricing.principles.p1title")}
              body={t("pricing.principles.p1body")}
            />
            <Principle
              icon={Snowflake}
              title={t("pricing.principles.p2title")}
              body={t("pricing.principles.p2body")}
            />
            <Principle
              icon={Lock}
              title={t("pricing.principles.p3title")}
              body={t("pricing.principles.p3body")}
            />
          </div>
        </Container>
      </section>

      {/* Worked examples */}
      <section>
        <Container className="py-14 sm:py-16">
          <SectionHead eyebrow={t("pricing.cases.eyebrow")} title={t("pricing.cases.title")} />
          <p
            className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed"
            style={{ color: "var(--ink-2)" }}
          >
            {t("pricing.cases.intro")}
          </p>

          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            {/* A — teacher-direct */}
            <ExampleCard
              tag={t("pricing.cases.a.tag")}
              title={t("pricing.cases.a.title")}
              body={t("pricing.cases.a.body")}
              settledLabel={t("pricing.cases.settledLabel")}
              settled={t("pricing.cases.a.settled")}
            >
              <Row label={t("pricing.cases.a.rowPrice")} value={egp(teacherDirect.price)} />
              <Row
                label={t("pricing.cases.a.rowCommission", { rate: pct(rates.teacherDirectBp) })}
                value={`− ${egp(teacherDirect.platformCommission)}`}
                tone="red"
              />
              <Total label={t("pricing.cases.a.rowNet")} value={egp(teacherDirect.teacherNet)} />
            </ExampleCard>

            {/* B — hall split */}
            <ExampleCard
              tag={t("pricing.cases.b.tag")}
              title={t("pricing.cases.b.title")}
              body={t("pricing.cases.b.body")}
              settledLabel={t("pricing.cases.settledLabel")}
              settled={t("pricing.cases.b.settled")}
            >
              {hallSplit ? (
                <>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <Eyebrow>{t("pricing.cases.perStudent")}</Eyebrow>
                  </div>
                  <Row label={t("pricing.cases.b.rowPrice")} value={egp(hallSplit.lessonPrice)} />
                  <Row
                    label={t("pricing.cases.b.rowPlatform", { rate: pct(rates.split!.platformBp) })}
                    value={`− ${egp(hallSplit.perStudent.platform)}`}
                    tone="red"
                  />
                  <Row
                    label={t("pricing.cases.b.rowCenter", { rate: pct(rates.split!.centerBp) })}
                    value={`− ${egp(hallSplit.perStudent.center)}`}
                    tone="red"
                  />
                  <Total
                    label={t("pricing.cases.b.rowTeacher")}
                    value={egp(hallSplit.perStudent.teacher)}
                  />

                  <div className="mt-6">
                    <Eyebrow>{t("pricing.cases.sessionTotal")}</Eyebrow>
                    <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
                      {t("pricing.cases.b.students", {
                        n: formatNumber(hallSplit.presentStudents, locale),
                      })}
                    </p>
                    <div className="mt-2">
                      <Row
                        label={t("pricing.cases.b.rowPlatform", {
                          rate: pct(rates.split!.platformBp),
                        })}
                        value={egp(hallSplit.sessionTotal.platform)}
                      />
                      <Row
                        label={t("pricing.cases.b.rowCenter", { rate: pct(rates.split!.centerBp) })}
                        value={egp(hallSplit.sessionTotal.center)}
                      />
                      <Total
                        label={t("pricing.cases.b.rowTeacher")}
                        value={egp(hallSplit.sessionTotal.teacher)}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <p className="py-6 text-sm" style={{ color: "var(--ink-3)" }}>
                  {t("pricing.cases.b.unconfigured")}
                </p>
              )}
            </ExampleCard>

            {/* C — flat fee, no hall pricing */}
            <ExampleCard
              tag={t("pricing.cases.c.tag")}
              title={t("pricing.cases.c.title")}
              body={t("pricing.cases.c.body")}
              settledLabel={t("pricing.cases.settledLabel")}
              settled={t("pricing.cases.c.settled")}
              note={t("pricing.cases.c.note")}
            >
              <div className="mb-1">
                <Eyebrow>{t("pricing.cases.perStudent")}</Eyebrow>
              </div>
              <Row label={t("pricing.cases.c.rowPrice")} value={egp(flatFee.lessonPrice)} />
              <Row
                label={t("pricing.cases.c.rowPlatformFee")}
                value={`− ${egp(flatFee.platformTeacherFee + flatFee.platformCenterFee)}`}
                tone="red"
              />
              <Row label={t("pricing.cases.c.rowCenterShare")} value={egp(flatFee.centerNet)} />
              <Total label={t("pricing.cases.c.rowTeacher")} value={egp(flatFee.teacherNet)} />
            </ExampleCard>

            {/* Method 2 — described, never invented: no global rate is seeded. */}
            <div className={styles.card}>
              <div className="flex size-10 items-center justify-center rounded-lg bg-(--amber-soft) text-(--amber)">
                <Landmark className="size-5" aria-hidden />
              </div>
              <h3 className="mt-4 text-[15px] font-bold" style={{ color: "var(--ink)" }}>
                {t("pricing.cases.method2Title")}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                {t("pricing.cases.method2Body")}
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* Timing */}
      <section className="border-y" style={{ borderColor: "var(--rule)", background: "var(--sheet)" }}>
        <Container className="py-14 sm:py-16">
          <SectionHead eyebrow={t("pricing.timing.eyebrow")} title={t("pricing.timing.title")} />
          <div className="mt-9 grid gap-3.5 md:grid-cols-3">
            <Principle
              icon={Receipt}
              title={t("pricing.timing.t1title")}
              body={t("pricing.timing.t1body")}
            />
            <Principle
              icon={Wallet}
              title={t("pricing.timing.t2title")}
              body={t("pricing.timing.t2body")}
            />
            <Principle
              icon={Banknote}
              title={t("pricing.timing.t3title")}
              body={t("pricing.timing.t3body")}
            />
          </div>
        </Container>
      </section>

      {/* Payment methods + what we don't charge */}
      <section>
        <Container className="py-14 sm:py-16">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <Eyebrow>{t("pricing.methods.eyebrow")}</Eyebrow>
              <h2 className={`${styles.sectionTitle} mt-2 font-bold`} style={{ color: "var(--ink)" }}>
                {t("pricing.methods.title")}
              </h2>
              <div className="mt-6 grid gap-3.5">
                <Principle
                  icon={CreditCard}
                  title={t("pricing.methods.onlineTitle")}
                  body={t("pricing.methods.onlineBody")}
                />
                <Principle
                  icon={Banknote}
                  title={t("pricing.methods.cashTitle")}
                  body={t("pricing.methods.cashBody")}
                />
              </div>
              <p className="mt-4 text-xs" style={{ color: "var(--ink-3)" }}>
                {t("pricing.methods.note")}
              </p>
            </div>

            <div>
              <Eyebrow>{t("pricing.noHidden.eyebrow")}</Eyebrow>
              <h2 className={`${styles.sectionTitle} mt-2 font-bold`} style={{ color: "var(--ink)" }}>
                {t("pricing.noHidden.title")}
              </h2>
              <ul className="mt-6 space-y-3">
                {(["b1", "b2", "b3", "b4", "b5"] as const).map((k) => (
                  <li
                    key={k}
                    className="flex gap-3 text-sm leading-relaxed"
                    style={{ color: "var(--ink-2)" }}
                  >
                    <span
                      className="mt-2 size-1.5 shrink-0 rounded-full"
                      style={{ background: "var(--teal)" }}
                      aria-hidden
                    />
                    {t(`pricing.noHidden.${k}`)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section className="border-t" style={{ borderColor: "var(--rule)" }}>
        <Container className="py-14 sm:py-16">
          <div className={`${styles.cardMuted} text-center`}>
            <h2 className={`${styles.sectionTitle} font-bold`} style={{ color: "var(--ink)" }}>
              {t("pricing.cta.title")}
            </h2>
            <p
              className="mx-auto mt-3 max-w-lg text-sm leading-relaxed"
              style={{ color: "var(--ink-2)" }}
            >
              {t("pricing.cta.body")}
            </p>
            <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <TrackedCta href="/contact" cta="contact" placement="pricing_footer" className="px-7 py-2.5">
                {t("pricing.cta.primary")}
              </TrackedCta>
              <DemoCta
                url={demoUrl}
                label={t("nav.bookDemo")}
                placement="pricing"
                variant="secondary"
                className="px-7 py-2.5"
                withIcon
              />
              <TrackedCta
                href="/register"
                cta="register"
                placement="pricing_footer"
                variant="secondary"
                className="px-7 py-2.5"
              >
                {t("pricing.cta.secondary")}
              </TrackedCta>
            </div>
          </div>
        </Container>
      </section>
    </MarketingShell>
  );
}

/* ── pieces ─────────────────────────────────────────────────────────────── */

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className={`${styles.sectionTitle} mt-3 font-bold`} style={{ color: "var(--ink)" }}>
        {title}
      </h2>
    </div>
  );
}

function Principle({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className={styles.card}>
      <div className="flex size-10 items-center justify-center rounded-lg bg-(--indigo-soft) text-(--indigo)">
        <Icon className="size-5" aria-hidden />
      </div>
      <h3 className="mt-4 text-[15px] font-bold" style={{ color: "var(--ink)" }}>
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
        {body}
      </p>
    </div>
  );
}

function ExampleCard({
  tag,
  title,
  body,
  settledLabel,
  settled,
  note,
  children,
}: {
  tag: string;
  title: string;
  body: string;
  settledLabel: string;
  settled: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`${styles.card} flex flex-col`}>
      <Eyebrow>{tag}</Eyebrow>
      <h3 className="mt-2 text-[17px] font-bold" style={{ color: "var(--ink)" }}>
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
        {body}
      </p>

      <div className="mt-5">{children}</div>

      <div
        className="mt-5 rounded-lg px-3 py-2.5 text-xs leading-relaxed"
        style={{ background: "var(--field)", color: "var(--ink-2)" }}
      >
        <span className="font-semibold" style={{ color: "var(--ink)" }}>
          {settledLabel}:{" "}
        </span>
        {settled}
      </div>
      {note ? (
        <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "red" }) {
  return (
    <div className={styles.moneyRow}>
      <span className="text-[13px]" style={{ color: "var(--ink-2)" }}>
        {label}
      </span>
      <Num
        className="text-sm font-medium"
        style={{ color: tone === "red" ? "var(--red)" : "var(--ink)" }}
      >
        {value}
      </Num>
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.moneyTotal}>
      <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
        {label}
      </span>
      <Num className="text-base font-semibold" style={{ color: "var(--teal)" }}>
        {value}
      </Num>
    </div>
  );
}
