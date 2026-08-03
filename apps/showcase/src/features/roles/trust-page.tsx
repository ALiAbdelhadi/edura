"use client";

import { Container } from "@/components/kit/container";
import { LedgerDiagram } from "@/components/media/ledger-diagram";
import { Shot } from "@/components/media/shot";
import { Counters } from "@/components/scene/counters";
import { PageHero } from "@/components/scene/page-hero";
import { Scene } from "@/components/scene/scene";
import { SubNav } from "@/components/scene/sub-nav";
import { appUrl } from "@/lib/app-links";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/lib/i18n";

/**
 * /trust — every claim points at a mechanism, and the page ends by linking the
 * REAL privacy policy, terms and help centre in apps/www rather than
 * paraphrasing them here. A marketing restatement of a legal document is a
 * second version of it, and the second version is the one that goes stale.
 */
export function TrustPage() {
  const t = useTranslations("trust");
  const locale = useLocale() as Locale;

  const sections = [
    { id: "append", label: t("nav.append") },
    { id: "isolation", label: t("nav.isolation") },
    { id: "minors", label: t("nav.minors") },
    { id: "sessions", label: t("nav.sessions") },
    { id: "analytics", label: t("nav.analytics") },
  ];

  return (
    <>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        body={t("body")}
        tone="--ink-2"
        media={<LedgerDiagram />}
      />

      <SubNav sections={sections} />

      <Scene
        id="append"
        eyebrow={t("append.eyebrow")}
        title={t("append.title")}
        body={t("append.body")}
        wide
        media={
          // Counted from the migrations, not estimated: 7 REVOKE statements and
          // 15 CREATE POLICY statements across packages/database/prisma/migrations.
          <Counters
            stats={[
              {
                value: 7,
                label: locale === "ar" ? "جداول محمية" : "Protected tables",
                source:
                  locale === "ar"
                    ? "بأوامر REVOKE في ملفات الترحيل"
                    : "By REVOKE statements in the migrations",
              },
              {
                value: 15,
                label: locale === "ar" ? "سياسة عزل" : "Isolation policies",
                source:
                  locale === "ar" ? "أمان على مستوى الصف" : "Row-level security",
              },
              {
                value: 36,
                label: locale === "ar" ? "جدول معزول" : "Tenant-scoped tables",
              },
              {
                value: 45,
                label: locale === "ar" ? "ترحيل مطبّق" : "Applied migrations",
              },
            ]}
          />
        }
      />

      <Scene
        id="isolation"
        eyebrow={t("isolation.eyebrow")}
        title={t("isolation.title")}
        body={t("isolation.body")}
        order="media-first"
        media={
          <Shot
            role="admin"
            screen="students"
            locale={locale}
            width={620}
            frame="browser"
            label="/dashboard/admin/students"
            alt={
              locale === "ar"
                ? "طلاب السنتر — كل سنتر بيشوف صفوفه هو بس"
                : "The center's students — each center sees only its own rows"
            }
          />
        }
      />

      <Scene
        id="minors"
        eyebrow={t("minors.eyebrow")}
        title={t("minors.title")}
        body={t("minors.body")}
      />

      <Scene
        id="sessions"
        eyebrow={t("sessions.eyebrow")}
        title={t("sessions.title")}
        body={t("sessions.body")}
        order="media-first"
      />

      <Scene
        id="analytics"
        eyebrow={t("analytics.eyebrow")}
        title={t("analytics.title")}
        body={t("analytics.body")}
        wide
      />

      {/* The documents themselves. Linked, never paraphrased. */}
      <section className="py-16">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-xl font-extrabold" style={{ color: "var(--ink)" }}>
              {t("links.title")}
            </h2>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {[
                { href: appUrl("/privacy", locale), label: t("links.privacy") },
                { href: appUrl("/terms", locale), label: t("links.terms") },
                { href: appUrl("/help", locale), label: t("links.help") },
              ].map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="focus-ledger inline-flex h-10 items-center rounded-[var(--radius-step-md)] border px-5 text-sm font-semibold"
                  style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
