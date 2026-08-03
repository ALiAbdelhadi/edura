"use client";

import { FlowVideo } from "@/components/media/flow-video";
import { LedgerDiagram } from "@/components/media/ledger-diagram";
import { Shot } from "@/components/media/shot";
import { Counters } from "@/components/scene/counters";
import { PageHero } from "@/components/scene/page-hero";
import { Scene } from "@/components/scene/scene";
import { SubNav } from "@/components/scene/sub-nav";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/lib/i18n";

/** /students — opens on the track → subjects flow. */
export function StudentsPage() {
  const t = useTranslations("students");
  const locale = useLocale() as Locale;

  const sections = [
    { id: "subjects", label: t("nav.subjects") },
    { id: "plans", label: t("nav.plans") },
    { id: "wallet", label: t("nav.wallet") },
    { id: "schedule", label: t("nav.schedule") },
    { id: "points", label: t("nav.points") },
  ];

  return (
    <>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        body={t("body")}
        tone="--amber"
        media={
          <FlowVideo
            flow="student-subjects"
            locale={locale}
            width={620}
            label="/dashboard/student/subjects"
            alt={
              locale === "ar"
                ? "مواد الطالب محددة تلقائيًا من شعبته."
                : "A student's subjects, assigned automatically from their track."
            }
          />
        }
      />

      <SubNav sections={sections} />

      <Scene
        id="subjects"
        eyebrow={t("subjects.eyebrow")}
        title={t("subjects.title")}
        body={t("subjects.body")}
        media={
          <Shot
            role="student"
            screen="subjects"
            locale={locale}
            width={620}
            frame="browser"
            label="/dashboard/student/subjects"
            alt={
              locale === "ar"
                ? "صفحة المواد وموادها من الكتالوج"
                : "The subjects page, populated from the catalog"
            }
          />
        }
      />

      <Scene
        id="plans"
        eyebrow={t("plans.eyebrow")}
        title={t("plans.title")}
        body={t("plans.body")}
        order="media-first"
        media={
          <Shot
            role="student"
            screen="courses"
            locale={locale}
            width={620}
            frame="browser"
            label="/dashboard/student/courses"
            alt={
              locale === "ar"
                ? "كورسات الطالب وخططها"
                : "The student's courses and their plans"
            }
          />
        }
      />

      <Scene
        id="wallet"
        eyebrow={t("wallet.eyebrow")}
        title={t("wallet.title")}
        body={t("wallet.body")}
        // A DIAGRAM rather than a screenshot, for two reasons. The claim is
        // "the balance is a sum, not a stored number", and entries adding up is
        // exactly what a diagram can show and a screenshot of a total cannot.
        // The wallet screen is also currently crashing in apps/www (see the
        // capture guard), so there is no honest screenshot to use.
        media={<LedgerDiagram />}
      />

      {/* Mobile capture in a phone frame — the student portal genuinely uses
          bottom navigation on a phone (CONSTITUTION.md §4), so a desktop shot
          squeezed into a phone outline would show a layout no student sees. */}
      <Scene
        id="schedule"
        eyebrow={t("schedule.eyebrow")}
        title={t("schedule.title")}
        body={t("schedule.body")}
        order="media-first"
        media={
          <div className="mx-auto w-[300px]">
            <Shot
              role="student"
              screen="schedule"
              locale={locale}
              width={300}
              frame="phone"
              alt={
                locale === "ar"
                  ? "جدول الطالب على الموبايل"
                  : "A student's schedule on mobile"
              }
            />
          </div>
        }
      />

      <Scene
        id="points"
        eyebrow={t("points.eyebrow")}
        title={t("points.title")}
        body={t("points.body")}
        wide
        media={
          // The platform's own seeded points rules — packages/database/prisma/seed.ts
          // POINTS_RULES. Not illustrative numbers.
          <Counters
            stats={[
              {
                value: 10,
                label: locale === "ar" ? "حضور حصة" : "Attending a lesson",
              },
              {
                value: 20,
                label: locale === "ar" ? "دفع أونلاين" : "Paying online",
              },
              {
                value: 50,
                label: locale === "ar" ? "أول حجز" : "First booking",
              },
              {
                value: 25,
                label: locale === "ar" ? "مكافأة الالتزام" : "Streak bonus",
              },
            ]}
          />
        }
      />
    </>
  );
}
