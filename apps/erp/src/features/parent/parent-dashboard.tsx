"use client";

// Parent home — the landing.
//
// AN INDEX, NOT A COPY. Everything here either answers a question outright or
// opens the page that owns it. Nothing is a truncated duplicate of a section
// that exists in full one tap away — that rule was won in an earlier pass and
// is kept.
//
// WHAT CHANGED IN THE IA PASS (PARENT_IA_AUDIT.md §3, §6.2):
//
//   · «الرسوم المستحقة» is GONE. It was `max(Σ enrollments.coursePrice −
//     Σ payments, 0)`, computed on the client, and there is no outstanding
//     balance in this domain to compute — see child-subscription-alert.tsx for
//     the full argument and CLEANUP_NOTES.md for the record. It was the
//     second-largest number on this screen and no server could recognise it.
//   · The three questions a parent actually opens the app with are answered
//     ABOVE the figures rather than under them: did they go today, when is the
//     next lesson, is the subscription about to lapse.
//   · The four full-width metric cards became a three-across strip. On a phone
//     `grid-cols-1` meant roughly 480px of scroll for four numbers, and
//     everything below them began off-screen.
//
// Colour is meaning: teal = money confirmed or a lesson attended, amber =
// waiting, red = blocked. Never decoration.
import React from "react";
import type { ReactNode } from "react";
import { useList, useCustom } from "@refinedev/core";
import { ChevronRight, Users } from "lucide-react";
import { DirectionalIcon } from "@repo/ui/components/directional-icon";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { Link } from "@/i18n/navigation";
import { Eyebrow, LedgerButton, Sheet } from "@/components/ledger";
import { useChildSelector } from "@/components/ui/child-selector";
import { GuidedTour } from "@/features/tour/guided-tour";
import { useTourGate } from "@/features/tour/use-tour-gate";
import { PARENT_TOUR_STEPS } from "@/features/parent/tour/steps";
import { LatestGradeCard } from "@/features/grades/latest-grade-card";
import { ChildNextLesson } from "@/features/parent/child-next-lesson";
import { ChildTodayLine } from "@/features/parent/child-today-line";
import { ChildSubscriptionAlert } from "@/features/parent/child-subscription-alert";
import { Figure, Money, SkeletonRows } from "./ledger-kit";

/**
 * One figure from the record, opening the page that owns it.
 *
 * ── WHY A STRIP AND NOT FULL-WIDTH CARDS ──────────────────────────────────
 *
 * Four `Metric` cards at `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` are one
 * column on a 375px phone: four stacked cards for four numbers, with the
 * quick action and everything else below the fold. Three across at every width
 * costs each figure some size and buys back the rest of the page. The `reason`
 * line survives only from `sm` up — it is lineage, and lineage is worth a line
 * on a laptop and worth the fold on a phone.
 *
 * The name is on the LINK, not left to be inferred from a nested span: an
 * anchor whose content is three spans reports no accessible name at all, which
 * is what these cards did before. The chevron is a `DirectionalIcon` because
 * "onward" points along the reading axis.
 */
function RecordCard({
  href,
  label,
  reason,
  openLabel,
  children,
}: {
  href: string;
  label: string;
  reason: string;
  openLabel: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={openLabel}
      className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--indigo)]"
    >
      <Sheet className="h-full p-3 transition-colors group-hover:border-[var(--indigo)] sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <Eyebrow>{label}</Eyebrow>
          <DirectionalIcon
            icon={ChevronRight}
            aria-hidden
            className="hidden size-4 shrink-0 transition-transform group-hover:translate-x-0.5 sm:block"
            style={{ color: "var(--ink-3)" }}
          />
        </div>
        <div className="mt-1.5 sm:mt-2">{children}</div>
        <p className="mt-1 hidden text-xs sm:block" style={{ color: "var(--ink-3)" }}>
          {reason}
        </p>
      </Sheet>
    </Link>
  );
}

export function ParentDashboard() {
  const t = useTranslations();
  const { formatEGP, formatPercent } = useFormatters();
  const { childId, childName, isLoading: childrenLoading } = useChildSelector();

  const { query: gradesQuery, result: gradesResult } = useList({
    resource: "grades",
    filters: childId
      ? [{ field: "studentId", operator: "eq", value: childId }]
      : undefined,
    queryOptions: { enabled: !!childId },
  });

  const { query: paymentsQuery, result: paymentsResult } = useList({
    resource: "payments",
    filters: childId
      ? [{ field: "studentId", operator: "eq", value: childId }]
      : undefined,
    queryOptions: { enabled: !!childId },
  });

  // `me/attendance` on the same URL the today-line reads, so React Query serves
  // both from one request.
  const { query: attendanceQuery, result: attendanceResult } = useCustom({
    url: childId ? `me/attendance?studentId=${childId}` : "me/attendance",
    method: "get",
    queryOptions: { enabled: !!childId },
  });

  // Declared with the other hooks: the gate cannot sit behind the loading
  // branch below, or the tour would never mount while data is in flight.
  const tour = useTourGate();

  const grades = (gradesResult?.data ?? []) as any[];
  const payments = (paymentsResult?.data ?? []) as any[];
  const attendance = (attendanceResult?.data as any) || null;

  const isLoading =
    childrenLoading ||
    gradesQuery.isLoading ||
    paymentsQuery.isLoading ||
    attendanceQuery.isLoading;

  // The headline averages the SUBJECT percentages rather than pooling every
  // mark, so a subject that happens to run more assessments cannot dominate the
  // figure a parent reads as "how is my child doing". Same rule as
  // /progress and the student dashboard, so the three agree.
  const courseMap = new Map<string, { scores: { score: number; max: number }[] }>();
  for (const g of grades) {
    if (!courseMap.has(g.courseId)) courseMap.set(g.courseId, { scores: [] });
    const myScore = g.scores?.[0];
    if (myScore) {
      courseMap.get(g.courseId)!.scores.push({ score: myScore.score, max: g.maxScore });
    }
  }
  let overallAvg = 0;
  if (courseMap.size > 0) {
    let totalPct = 0;
    for (const [, data] of courseMap) {
      const totalScore = data.scores.reduce((a, b) => a + b.score, 0);
      const totalMax = data.scores.reduce((a, b) => a + b.max, 0);
      totalPct += totalMax > 0 ? (totalScore / totalMax) * 100 : 0;
    }
    overallAvg = Math.round(totalPct / courseMap.size);
  }

  // Money actually paid FOR this child, by anyone — the parent's card, the
  // other parent's cash at the counter, the student's own wallet. `payments`
  // is scoped by beneficiary, which is what makes this a record rather than a
  // statement about one payer.
  const paid = payments
    .filter((p: any) => p.amount > 0)
    .reduce((a: number, b: any) => a + b.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={t("roles.parent")} title={t("parentDashboard.title")} />

      {/* First entry only: the guided tour of the REAL portal offers itself
          once, then never again (user_prefs.tour_completed). The emulator keeps
          its permanent entry in the menu and this tour's last card points at
          it; both read the same flag, so they cannot open together. */}
      <GuidedTour
        steps={PARENT_TOUR_STEPS}
        namespace="parentTour"
        open={tour.shouldOpen}
        onClose={tour.markDone}
      />

      {isLoading ? (
        <SkeletonRows rows={4} />
      ) : !childId ? (
        // Names the fact AND the next step. Nothing in this portal works until
        // a link is approved, so "no children" is the start of a task, not a
        // dead end.
        <EmptyState
          icon={Users}
          title={t("parentDashboard.noChildren")}
          action={
            <Button asChild>
              <Link href="/dashboard/parent/children">
                {t("parentChild.link")}
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* ORDER IS THE ARGUMENT. Today's register outranks everything when
              it exists — a parent opening the app in the evening is asking
              about the lesson that already happened. It renders nothing on a
              day with no record, so the hero leads the rest of the time. */}
          <ChildTodayLine
            childId={childId}
            childName={childName}
            href="/dashboard/parent/attendance"
          />

          <ChildNextLesson childId={childId} />

          {/* Conditional, self-clearing, at most one. */}
          <ChildSubscriptionAlert childId={childId} childName={childName} />

          <LatestGradeCard
            studentId={childId}
            href="/dashboard/parent/progress"
            label={t("parentDashboard.latestGrade")}
            openLabel={t("parentDashboard.openRecord", {
              record: t("parentDashboard.latestGrade"),
            })}
          />

          {/* THREE figures, not four. The fourth was «الرسوم المستحقة». */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <RecordCard
              href="/dashboard/parent/attendance"
              label={t("parentDashboard.attendanceRate")}
              reason={t("parentDashboard.attendanceReason", {
                count: (attendance?.records ?? []).length,
              })}
              openLabel={t("parentDashboard.openRecord", {
                record: t("parentDashboard.attendanceRate"),
              })}
            >
              {/* Was a literal `%`. The Arabic UI writes ٪, and /progress —
                  one tap away, showing the same figure — already did. */}
              <Figure className="text-[22px] font-semibold sm:text-[28px]">
                {formatPercent(attendance?.rate ?? 0)}
              </Figure>
            </RecordCard>

            <RecordCard
              href="/dashboard/parent/progress"
              label={t("parentDashboard.averageGrade")}
              reason={t("parentDashboard.gradeReason", { count: courseMap.size })}
              openLabel={t("parentDashboard.openRecord", {
                record: t("parentDashboard.averageGrade"),
              })}
            >
              <Figure className="text-[22px] font-semibold sm:text-[28px]">
                {formatPercent(overallAvg)}
              </Figure>
            </RecordCard>

            <RecordCard
              href="/dashboard/parent/fees"
              label={t("parentDashboard.feesPaid")}
              reason={t("parentDashboard.paidReason")}
              openLabel={t("parentDashboard.openRecord", {
                record: t("parentDashboard.feesPaid"),
              })}
            >
              <Money amount={paid} format={formatEGP} tone="paid" />
            </RecordCard>
          </div>

          {/* The act, one tap from the alert that prompts it. */}
          <LedgerButton variant="primary" asChild>
            <Link href="/dashboard/parent/pay">
              {t("parentDashboard.payFor", { name: childName })}
            </Link>
          </LedgerButton>
        </>
      )}
    </div>
  );
}
