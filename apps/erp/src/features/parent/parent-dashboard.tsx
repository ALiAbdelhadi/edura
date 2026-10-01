"use client";

import React from "react";
import type { ReactNode } from "react";
import { useList, useCustom } from "@refinedev/core";
import { ChevronRight, Users } from "lucide-react";
import { DirectionalIcon } from "@repo/ui/components/directional-icon";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { Button } from "@repo/ui/components/button";
import { QuerySection, combineQueries } from "@repo/ui/components/query-section";
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
import { Figure, Money, SkeletonRows } from "@repo/ui/components/ledger";
import { QUERY_FRESHNESS } from "@/lib/refine";

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
  const {
    childId,
    childName,
    isLoading: childrenLoading,
    failed: childrenFailed,
  } = useChildSelector();

  const { query: gradesQuery, result: gradesResult } = useList({
    resource: "grades",
    filters: childId
      ? [{ field: "studentId", operator: "eq", value: childId }]
      : undefined,
    queryOptions: { ...QUERY_FRESHNESS.list, enabled: !!childId },
  });

  const { query: paymentsQuery, result: paymentsResult } = useList({
    resource: "payments",
    filters: childId
      ? [{ field: "studentId", operator: "eq", value: childId }]
      : undefined,
    queryOptions: { enabled: !!childId },
  });

  const { query: attendanceQuery, result: attendanceResult } = useCustom({
    url: childId ? `me/attendance?studentId=${childId}` : "me/attendance",
    method: "get",
    queryOptions: { enabled: !!childId },
  });

  const tour = useTourGate();

  const grades = (gradesResult?.data ?? []) as any[];
  const payments = (paymentsResult?.data ?? []) as any[];
  const attendance = (attendanceResult?.data as any) || null;

  const combined = combineQueries(gradesQuery, paymentsQuery, attendanceQuery);

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

  const paid = payments
    .filter((p: any) => p.amount > 0)
    .reduce((a: number, b: any) => a + b.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={t("roles.parent")} title={t("parentDashboard.title")} />

      <GuidedTour
        steps={PARENT_TOUR_STEPS}
        namespace="parentTour"
        open={tour.shouldOpen}
        onClose={tour.markDone}
      />

      {childrenLoading ? (
        <SkeletonRows rows={4} />
      ) : childrenFailed ? (
        <EmptyState icon={Users} title={t("parentPay.childrenUnavailable")} />
      ) : !childId ? (
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
        <QuerySection query={combined} skeleton={<SkeletonRows rows={4} />}>
          <ChildTodayLine
            childId={childId}
            childName={childName}
            href="/dashboard/parent/attendance"
          />

          <ChildNextLesson childId={childId} />

          <ChildSubscriptionAlert childId={childId} childName={childName} />

          <LatestGradeCard
            studentId={childId}
            href="/dashboard/parent/progress"
            label={t("parentDashboard.latestGrade")}
            openLabel={t("parentDashboard.openRecord", {
              record: t("parentDashboard.latestGrade"),
            })}
          />

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

          <LedgerButton variant="primary" asChild>
            <Link href="/dashboard/parent/pay">
              {t("parentDashboard.payFor", { name: childName })}
            </Link>
          </LedgerButton>
        </QuerySection>
      )}
    </div>
  );
}
