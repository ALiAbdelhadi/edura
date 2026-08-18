"use client";

// Parent dashboard — the landing.
//
// Ledger treatment throughout. The metrics carry a third row stating *why the
// number matters* (what it is out of, what period it covers) rather than a
// percentage delta with no referent — that was the defect the audit named, and
// a trend arrow with nothing behind it is worse on a parent's screen than on an
// operator's, because the parent cannot drill in to check it.
//
// Colour is meaning: teal = money confirmed, amber = waiting (an outstanding
// balance is *unpaid*, not *blocking*, so it is never red).
import React from "react";
import type { ReactNode } from "react";
import { useList, useCustom } from "@refinedev/core";
import { ChevronRight, Users } from "lucide-react";
import { DirectionalIcon } from "@repo/ui/components/directional-icon";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { Link } from "@/i18n/navigation";
import { useChildSelector, ChildSelectorBar } from "@/components/ui/child-selector";
import { GuidedTour } from "@/features/tour/guided-tour";
import { useTourGate } from "@/features/tour/use-tour-gate";
import { PARENT_TOUR_STEPS } from "@/features/parent/tour/steps";
import { Figure, Metric, Money, SkeletonRows } from "./ledger-kit";

/**
 * A metric that is also the door to the page owning it.
 *
 * The name is on the LINK, not left to be inferred from the nested label — an
 * anchor whose content is three spans reports no accessible name at all, which
 * is what the four cards here were doing. The chevron is a `DirectionalIcon`
 * because "onward" points along the reading axis (§6.4).
 */
function MetricLink({
  href,
  openLabel,
  children,
}: {
  href: string;
  openLabel: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={openLabel}
      className="group relative block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--indigo)]"
    >
      {children}
      <DirectionalIcon
        icon={ChevronRight}
        aria-hidden
        className="absolute top-4 size-4 text-ink-3 transition-transform group-hover:translate-x-0.5 ltr:right-4 rtl:left-4"
      />
    </Link>
  );
}

export function ParentDashboard() {
  const t = useTranslations();
  const { formatEGP, formatDate, formatPercent } = useFormatters();
  const { childId, isLoading: childrenLoading } = useChildSelector();

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

  const { query: enrollmentsQuery, result: enrollmentsResult } = useList({
    resource: "enrollments",
    filters: childId
      ? [
          { field: "studentId", operator: "eq", value: childId },
          { field: "status", operator: "eq", value: "active" },
        ]
      : undefined,
    queryOptions: { enabled: !!childId },
  });

  const { query: attendanceQuery, result: attendanceResult } = useCustom({
    url: "me/attendance",
    method: "get",
    config: { query: childId ? { studentId: childId } : undefined },
    queryOptions: { enabled: !!childId },
  });

  // Declared with the other hooks: the gate cannot sit behind the loading
  // branch below, or the tour would never mount while data is in flight.
  const tour = useTourGate();

  const grades = (gradesResult?.data ?? []) as any[];
  const payments = (paymentsResult?.data ?? []) as any[];
  const enrollments = (enrollmentsResult?.data ?? []) as any[];
  const attendance = (attendanceResult?.data as any) || null;

  const isLoading =
    childrenLoading ||
    gradesQuery.isLoading ||
    paymentsQuery.isLoading ||
    enrollmentsQuery.isLoading ||
    attendanceQuery.isLoading;

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

  const netPaid = payments.reduce((a: number, b: any) => a + (b.amount ?? 0), 0);
  const paid = payments
    .filter((p: any) => p.amount > 0)
    .reduce((a: number, b: any) => a + b.amount, 0);
  const owed = enrollments.reduce((a: number, b: any) => a + (b.coursePrice ?? 0), 0);
  const pendingAmount = Math.max(owed - netPaid, 0);


  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={t("roles.parent")}
        title={t("nav.dashboard")}
        actions={<ChildSelectorBar />}
      />

      {/* First entry only: the guided tour of the REAL portal offers itself
          once, then never again (user_prefs.tour_completed).

          It replaces the emulator as the first-run surface, matching the
          student portal: a tour is the right thing to meet someone with
          (thirty seconds, points at their own screen), and the emulator is the
          right thing to CHOOSE (ten minutes, a simulated world). The emulator
          is not lost — it keeps its permanent entry in the menu, and this
          tour's last card points at it. Both cannot open on first run, because
          both read the same `tour_completed` flag. */}
      <GuidedTour
        steps={PARENT_TOUR_STEPS}
        namespace="parentTour"
        open={tour.shouldOpen}
        onClose={tour.markDone}
      />

      {isLoading ? (
        <SkeletonRows rows={4} />
      ) : !childId ? (
        <EmptyState icon={Users} title={t("parentDashboard.noChildren")} />
      ) : (
        <>
          {/*
            AN INDEX, NOT A COPY.

            This home used to carry, below these four numbers, a "recent
            grades" list, a "recent payments" list, and three charts — and
            every one of them was a truncated duplicate of a section that
            exists in FULL on a page the sidebar already lists: the grades and
            their chart on /progress, the payments and their timeline on /fees,
            the attendance trend on /attendance. A parent read the same thing
            twice and got the shorter version first.

            What is left is the four figures, and each one now OPENS the page
            that owns it. Nothing was removed from the portal — every list and
            every chart is still there, at full size, one tap away.
          */}
          {/*
            Each card is the ONLY route to the page that owns its number, so it
            has to look like a route. They were bare `<Link><Metric>`: the
            accessibility tree reported four links with NO ACCESSIBLE NAME
            (`Metric`'s label is a nested span, not the link's name), there was
            no focus ring for the keyboard, and a `hover:bg-field` tint was the
            only hint that any of it was clickable. Same treatment as the
            student dashboard's record cards.
          */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricLink
              href="/dashboard/parent/attendance"
              openLabel={t("parentDashboard.openRecord", {
                record: t("parentDashboard.attendanceRate"),
              })}
            >
              <Metric
                className="h-full transition-colors group-hover:bg-field"
                label={t("parentDashboard.attendanceRate")}
                // Was a literal `%`. The Arabic UI writes ٪, and /progress —
                // one tap away, showing the same figure — already did.
                value={<Figure>{formatPercent(attendance?.rate ?? 0)}</Figure>}
                reason={t("parentDashboard.attendanceReason", {
                  count: (attendance?.records ?? []).length,
                })}
              />
            </MetricLink>
            <MetricLink
              href="/dashboard/parent/progress"
              openLabel={t("parentDashboard.openRecord", {
                record: t("parentDashboard.averageGrade"),
              })}
            >
              <Metric
                className="h-full transition-colors group-hover:bg-field"
                label={t("parentDashboard.averageGrade")}
                value={<Figure>{formatPercent(overallAvg)}</Figure>}
                reason={t("parentDashboard.gradeReason", { count: courseMap.size })}
              />
            </MetricLink>
            <MetricLink
              href="/dashboard/parent/fees"
              openLabel={t("parentDashboard.openRecord", {
                record: t("parentDashboard.feesPaid"),
              })}
            >
              <Metric
                className="h-full transition-colors group-hover:bg-field"
                label={t("parentDashboard.feesPaid")}
                value={<Money amount={paid} format={formatEGP} tone="paid" />}
                reason={t("parentDashboard.paidReason")}
              />
            </MetricLink>
            <MetricLink
              href="/dashboard/parent/fees"
              openLabel={t("parentDashboard.openRecord", {
                record: t("parentDashboard.feesDue"),
              })}
            >
              <Metric
                className="h-full transition-colors group-hover:bg-field"
                label={t("parentDashboard.feesDue")}
                value={
                  <Money amount={pendingAmount} format={formatEGP} tone="due" />
                }
                reason={t("parentDashboard.dueReason", { count: enrollments.length })}
              />
            </MetricLink>
          </div>

        </>
      )}
    </div>
  );
}
