"use client";

import { FlowVideo } from "@/components/media/flow-video";
import { SettlementDiagram } from "@/components/media/settlement-diagram";
import { Shot } from "@/components/media/shot";
import { Counters } from "@/components/scene/counters";
import { PageHero } from "@/components/scene/page-hero";
import { Scene } from "@/components/scene/scene";
import { SubNav } from "@/components/scene/sub-nav";
import type { Locale } from "@/lib/i18n";
import { useLocale, useTranslations } from "next-intl";


export function OwnersPage() {
  const t = useTranslations("owners");
  const locale = useLocale() as Locale;

  const sections = [
    { id: "counter", label: t("nav.counter") },
    { id: "settlement", label: t("nav.settlement") },
    { id: "halls", label: t("nav.halls") },
    { id: "ledger", label: t("nav.ledger") },
    { id: "team", label: t("nav.team") },
  ];

  return (
    <>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        body={t("body")}
        tone="--indigo"
        media={
          <Shot
            role="admin"
            screen="home"
            locale={locale}
            width={620}
            frame="browser"
            label="/dashboard/admin"
            priority
            alt={
              locale === "ar"
                ? "لوحة تحكم السنتر بمجموعاتها وطلابها"
                : "The center dashboard, with its groups and students"
            }
          />
        }
      />

      <SubNav sections={sections} />

      <Scene
        id="counter"
        eyebrow={t("counter.eyebrow")}
        title={t("counter.title")}
        body={t("counter.body")}
        order="media-first"
        media={
          <FlowVideo
            flow="counter-checkin"
            locale={locale}
            width={620}
            label="/dashboard/staff/checkin"
            alt={
              locale === "ar"
                ? "موظف الاستقبال يكتب كود الطالب ويلاقيه في ثانية."
                : "The front desk types a student code and finds them in seconds."
            }
          />
        }
      />

      <Scene
        id="settlement"
        eyebrow={t("settlement.eyebrow")}
        title={t("settlement.title")}
        body={t("settlement.body")}
        wide
        media={
          <div className="mx-auto max-w-3xl">
            {/* 60.00 EGP at the platform's published 10% / 25% defaults. The
                diagram derives the teacher's share as the REMAINDER, exactly as
                distributeSessionRevenue does, so the three parts always sum to
                the price with no rounding leak. */}
            <SettlementDiagram price={6000} platformBp={1000} centerBp={2500} />
            <p
              className="mt-6 text-center text-xs leading-relaxed"
              style={{ color: "var(--ink-3)" }}
            >
              {t("settlement.note")}
            </p>
          </div>
        }
      />

      <Scene
        id="halls"
        eyebrow={t("halls.eyebrow")}
        title={t("halls.title")}
        body={t("halls.body")}
        media={
          <Shot
            role="admin"
            screen="rooms"
            locale={locale}
            width={620}
            frame="browser"
            label="/dashboard/admin/rooms"
            alt={
              locale === "ar"
                ? "قاعات السنتر بأسعارها وطرق تسعيرها"
                : "The center's halls, with their prices and pricing methods"
            }
          />
        }
      />

      <Scene
        id="ledger"
        eyebrow={t("ledger.eyebrow")}
        title={t("ledger.title")}
        body={t("ledger.body")}
        order="media-first"
        media={
          <Shot
            role="admin"
            screen="reports"
            locale={locale}
            width={620}
            frame="browser"
            label="/dashboard/admin/reports"
            alt={
              locale === "ar"
                ? "تقارير السنتر مبنية على نفس القيود"
                : "Center reports, derived from the same entries"
            }
          />
        }
      />

      <Scene
        id="team"
        eyebrow={t("team.eyebrow")}
        title={t("team.title")}
        body={t("team.body")}
        wide
        media={
          <>
            <div className="grid gap-8 lg:grid-cols-2">
              <Shot
                role="admin"
                screen="staff"
                locale={locale}
                width={560}
                frame="browser"
                label="/dashboard/admin/staff"
                alt={
                  locale === "ar"
                    ? "حسابات طاقم السنتر وأدوارهم"
                    : "Center staff accounts and their roles"
                }
              />
              <Shot
                role="admin"
                screen="notes"
                locale={locale}
                width={560}
                frame="browser"
                label="/dashboard/admin/notes"
                alt={
                  locale === "ar"
                    ? "لوحة مهام الفريق داخل السنتر"
                    : "The team's task board inside the center"
                }
              />
            </div>
            <div className="mt-14">
              <Counters
                stats={[
                  {
                    value: 3,
                    label: locale === "ar" ? "قاعات" : "Halls",
                    source:
                      locale === "ar"
                        ? "تغطي طرق التسعير التلاتة"
                        : "Covering all three pricing shapes",
                  },
                  {
                    value: 4,
                    label: locale === "ar" ? "مجموعات" : "Groups",
                    source: locale === "ar" ? "٣ مدرّسين" : "Across 3 teachers",
                  },
                  {
                    value: 56,
                    label: locale === "ar" ? "حصص" : "Sessions",
                    source:
                      locale === "ar" ? "٨ أسابيع، ماضية وقادمة" : "8 weeks, past and upcoming",
                  },
                  {
                    value: 195,
                    label: locale === "ar" ? "سجل حضور" : "Attendance records",
                    source:
                      locale === "ar"
                        ? "بكل الحالات اللي المحرّك بينتجها"
                        : "In every status the engine produces",
                  },
                ]}
              />
            </div>
          </>
        }
      />
    </>
  );
}