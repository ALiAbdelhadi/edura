import { Container } from "@/components/kit/container";
import { Eyebrow, LedgerButton, Num } from "@/components/ledger";
import { Link } from "@/i18n/navigation";
import {
  Building2,
  CalendarCheck2,
  GraduationCap,
  HeartHandshake,
  Landmark,
  ShieldCheck,
  Smartphone,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { DemoCta } from "@/features/marketing/demo-cta";
import { MarketingShell } from "@/features/marketing/marketing-shell";
import { demoBookingUrl } from "@/features/marketing/nav";
import { TrackedCta } from "@/features/marketing/tracked-cta";
import { getTranslations } from "next-intl/server";
import styles from "./landing.module.css";

export async function LandingScreen() {
  const t = await getTranslations("landing");
  const tm = await getTranslations("marketing");
  const demoUrl = demoBookingUrl();

  const steps = [
    { n: 1, icon: Users, title: t("how.s1title"), body: t("how.s1body") },
    { n: 2, icon: CalendarCheck2, title: t("how.s2title"), body: t("how.s2body") },
    { n: 3, icon: Wallet, title: t("how.s3title"), body: t("how.s3body") },
  ] as const;

  return (
    <MarketingShell active="/">
      {/* Hero */}
      <section className="border-b" style={{ borderColor: "var(--rule)" }}>
        <Container className="py-12 sm:py-16 lg:py-20">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
            <div className="text-center lg:text-start">
              <Eyebrow>{t("hero.eyebrow")}</Eyebrow>
              <h1 className={`${styles.heroTitle} mt-4 max-w-2xl font-extrabold lg:mx-0 mx-auto`}>
                {t("hero.title")}
              </h1>
              <p
                className={`${styles.heroSubtitle} mx-auto mt-5 max-w-xl lg:mx-0`}
                style={{ color: "var(--ink-2)" }}
              >
                {t("hero.subtitle")}
              </p>
              <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center lg:justify-start">
                <TrackedCta
                  href="/register"
                  cta="register"
                  placement="hero"
                  className="px-7 py-2.5 text-[15px]"
                >
                  {t("hero.ctaPrimary")}
                </TrackedCta>
                {/* Renders nothing when NEXT_PUBLIC_CALENDLY_URL is unset, and
                    the sign-in link stays as the secondary action either way. */}
                <DemoCta
                  url={demoUrl}
                  label={tm("nav.bookDemo")}
                  placement="hero"
                  variant="secondary"
                  className="px-7 py-2.5 text-[15px]"
                  withIcon
                />
                <LedgerButton asChild variant="secondary" className="px-7 py-2.5 text-[15px]">
                  <Link href="/login">{t("hero.ctaSecondary")}</Link>
                </LedgerButton>
              </div>
              <div className={`${styles.trustRow} lg:justify-start`}>
                <span className={styles.trustItem}>
                  <Smartphone className="size-3.5 shrink-0" aria-hidden />
                  {t("hero.trustMobile")}
                </span>
                <span className={styles.trustItem}>
                  <span className={styles.trustDot} aria-hidden />
                  {t("hero.trustNoInstall")}
                </span>
              </div>
            </div>

            <HeroPreview
              title={t("hero.previewTitle")}
              sessions={t("hero.previewSessions")}
              checkedIn={t("hero.previewCheckedIn")}
              settled={t("hero.previewSettled")}
            />
          </div>
        </Container>
      </section>

      {/* Roles — bento grid */}
      <section style={{ background: "var(--sheet)" }} className="border-b" >
        <Container className="py-14 sm:py-16 lg:py-20">
          <SectionHead eyebrow={t("roles.eyebrow")} title={t("roles.title")} />
          <div className={`${styles.roleGrid} mt-10 lg:mt-12`}>
            <RoleCard
              className={styles.roleCenter}
              icon={Building2}
              tone="indigo"
              name={t("roles.center.name")}
              bullets={[
                t("roles.center.b1"),
                t("roles.center.b2"),
                t("roles.center.b3"),
                t("roles.center.b4"),
              ]}
            />
            <RoleCard
              className={styles.roleTeacher}
              icon={GraduationCap}
              tone="teal"
              name={t("roles.teacher.name")}
              bullets={[
                t("roles.teacher.b1"),
                t("roles.teacher.b2"),
                t("roles.teacher.b3"),
                t("roles.teacher.b4"),
              ]}
            />
            <RoleCard
              className={styles.roleParent}
              icon={HeartHandshake}
              tone="amber"
              name={t("roles.parent.name")}
              bullets={[
                t("roles.parent.b1"),
                t("roles.parent.b2"),
                t("roles.parent.b3"),
                t("roles.parent.b4"),
              ]}
            />
            <RoleCard
              className={styles.roleStudent}
              icon={UserRound}
              tone="indigo"
              name={t("roles.student.name")}
              bullets={[
                t("roles.student.b1"),
                t("roles.student.b2"),
                t("roles.student.b3"),
                t("roles.student.b4"),
              ]}
            />
          </div>
        </Container>
      </section>

      {/* How it works */}
      <section>
        <Container className="py-14 sm:py-16 lg:py-20">
          <SectionHead eyebrow={t("how.eyebrow")} title={t("how.title")} />
          <div className={`${styles.steps} mt-10 lg:mt-12`}>
            {steps.map((s) => (
              <div key={s.n} className={styles.stepCard}>
                <div className="flex items-start justify-between gap-3">
                  <div className={styles.stepNum}>
                    <Num>{s.n}</Num>
                  </div>
                  <div
                    className="flex size-10 items-center justify-center rounded-lg"
                    style={{ background: "var(--field)", color: "var(--ink-2)" }}
                  >
                    <s.icon className="size-5" aria-hidden />
                  </div>
                </div>
                <h3 className="mt-4 text-[15px] font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Money + Safety */}
      <section className="border-y" style={{ borderColor: "var(--rule)", background: "var(--sheet)" }}>
        <Container className="py-14 sm:py-16 lg:py-20">
          <div className={styles.featureGrid}>
            <FeatureBand
              icon={Landmark}
              iconClass="bg-(--teal-soft) text-(--teal)"
              eyebrow={t("money.eyebrow")}
              title={t("money.title")}
              bullets={[t("money.b1"), t("money.b2"), t("money.b3"), t("money.b4")]}
              markClass="text-(--teal)"
            />
            <FeatureBand
              icon={ShieldCheck}
              iconClass="bg-(--amber-soft) text-(--amber)"
              eyebrow={t("safety.eyebrow")}
              title={t("safety.title")}
              bullets={[t("safety.b1"), t("safety.b2"), t("safety.b3"), t("safety.b4")]}
              markClass="text-(--amber)"
            />
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section>
        <Container className="py-14 sm:py-16 lg:py-20">
          <div className={styles.ctaBand}>
            <h2 className={`${styles.sectionTitle} font-bold`}>{t("cta.title")}</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed opacity-90 sm:text-[15px]">
              {t("cta.body")}
            </p>
            <TrackedCta
              href="/register"
              cta="register"
              placement="landing_cta_band"
              variant="secondary"
              className="mt-7 border-0 px-8 py-2.5 text-[15px] font-semibold"
              style={{ background: "var(--indigo-ink)", color: "var(--indigo)" }}
            >
              {t("cta.button")}
            </TrackedCta>
          </div>
        </Container>
      </section>
    </MarketingShell>
  );
}

function HeroPreview({
  title,
  sessions,
  checkedIn,
  settled,
}: {
  title: string;
  sessions: string;
  checkedIn: string;
  settled: string;
}) {
  return (
    <div className={`${styles.previewStack} lg:ms-auto`} aria-hidden>
      <div className={styles.previewBack} />
      <div className={styles.previewFront}>
        <Eyebrow>{title}</Eyebrow>
        <div className="mt-4">
          <div className={styles.previewStat}>
            <span className="text-sm" style={{ color: "var(--ink-2)" }}>
              {sessions}
            </span>
            <Num className="text-sm font-semibold">3</Num>
          </div>
          <div className={styles.previewStat}>
            <span className="text-sm" style={{ color: "var(--ink-2)" }}>
              {checkedIn}
            </span>
            <Num className="text-sm font-semibold" style={{ color: "var(--teal)" }}>
              24
            </Num>
          </div>
          <div className={styles.previewStat}>
            <span className="text-sm" style={{ color: "var(--ink-2)" }}>
              {settled}
            </span>
            <Num className="text-sm font-semibold">4,200</Num>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className={`${styles.sectionTitle} mt-3 font-bold`}>{title}</h2>
    </div>
  );
}

const ROLE_TONES = {
  indigo: "bg-(--indigo-soft) text-(--indigo)",
  teal: "bg-(--teal-soft) text-(--teal)",
  amber: "bg-(--amber-soft) text-(--amber)",
} as const;

function RoleCard({
  icon: Icon,
  tone,
  name,
  bullets,
  className,
}: {
  icon: LucideIcon;
  tone: keyof typeof ROLE_TONES;
  name: string;
  bullets: string[];
  className?: string;
}) {
  return (
    <div className={`${styles.roleCard} ${className ?? ""}`}>
      <div className={`flex size-10 items-center justify-center rounded-lg ${ROLE_TONES[tone]}`}>
        <Icon className="size-5" aria-hidden />
      </div>
      <h3 className="mt-3.5 text-[15px] font-bold">{name}</h3>
      <ul className="mt-3 flex-1 space-y-2">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            <span
              className="mt-2 size-1 shrink-0 rounded-full"
              style={{ background: "var(--ink-3)" }}
              aria-hidden
            />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeatureBand({
  icon: Icon,
  iconClass,
  eyebrow,
  title,
  bullets,
  markClass,
}: {
  icon: LucideIcon;
  iconClass: string;
  eyebrow: string;
  title: string;
  bullets: string[];
  markClass: string;
}) {
  return (
    <div className={styles.featureCard}>
      <div className={`flex size-11 items-center justify-center rounded-lg ${iconClass}`}>
        <Icon className="size-5.5" aria-hidden />
      </div>
      <div className="mt-4">
        <Eyebrow>{eyebrow}</Eyebrow>
      </div>
      <h2 className="mt-2 text-xl font-bold sm:text-[1.35rem]">{title}</h2>
      <ul className="mt-4 space-y-2.5">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
            <span className={`mt-2.5 size-1.5 shrink-0 rounded-full bg-current ${markClass}`} aria-hidden />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}
