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
import { useList, useCustom } from "@refinedev/core";
import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { LineChart, ProgressArcChart } from "@/components/charts";
import { useChildSelector, ChildSelectorBar } from "@/components/ui/child-selector";
import {
  Figure,
  Metric,
  Money,
  SectionHead,
  SkeletonRows,
} from "./ledger-kit";

export function ParentDashboard() {
  const t = useTranslations();
  const { formatEGP, formatDate } = useFormatters();
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

  const recentGrades = grades.slice(-3);
  const recentPayments = payments.slice(-3);

  const attendanceTrend = React.useMemo(() => {
    const records = (attendance?.records ?? []) as Array<{
      date: string;
      status: "present" | "absent" | "late";
    }>;
    const byDay = records.slice(-14).map((record) => ({
      x: formatDate(`${record.date}T00:00:00`, { month: "short", day: "numeric" }),
      value: record.status === "present" ? 100 : record.status === "late" ? 60 : 0,
    }));
    return [
      {
        id: "attendance",
        label: t("parentDashboard.attendanceLabel"),
        color: "var(--series-2)",
        points: byDay,
      },
    ];
  }, [attendance, t, formatDate]);

  const gradeTrend = React.useMemo(() => {
    const ordered = [...grades]
      .filter((g: any) => g.date)
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-12)
      .map((grade: any) => {
        const score = grade.scores?.[0];
        const value = score
          ? Math.round((score.score / (grade.maxScore || 1)) * 100)
          : 0;
        return { x: formatDate(grade.date, { month: "short", day: "numeric" }), value };
      });
    return [
      {
        id: "grades",
        label: t("parentDashboard.gradePercentLabel"),
        color: "var(--series-1)",
        points: ordered,
      },
    ];
  }, [grades, t, formatDate]);

  const totalFees = paid + pendingAmount;
  const paidRatio = totalFees > 0 ? (paid / totalFees) * 100 : 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={t("roles.parent")}
        title={t("nav.dashboard")}
        actions={<ChildSelectorBar />}
      />

      {isLoading ? (
        <SkeletonRows rows={4} />
      ) : !childId ? (
        <EmptyState icon={Users} title={t("parentDashboard.noChildren")} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label={t("parentDashboard.attendanceRate")}
              value={<Figure>{attendance?.rate ?? 0}%</Figure>}
              reason={t("parentDashboard.attendanceReason", {
                count: (attendance?.records ?? []).length,
              })}
            />
            <Metric
              label={t("parentDashboard.averageGrade")}
              value={<Figure>{overallAvg}%</Figure>}
              reason={t("parentDashboard.gradeReason", { count: courseMap.size })}
            />
            <Metric
              label={t("parentDashboard.feesPaid")}
              value={<Money amount={paid} format={formatEGP} tone="paid" />}
              reason={t("parentDashboard.paidReason")}
            />
            <Metric
              label={t("parentDashboard.feesDue")}
              value={
                <Money amount={pendingAmount} format={formatEGP} tone="due" />
              }
              reason={t("parentDashboard.dueReason", { count: enrollments.length })}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="flex flex-col gap-3">
              <SectionHead
                eyebrow={t("parentDashboard.latestEyebrow")}
                title={t("parentDashboard.recentGrades")}
              />
              {recentGrades.length === 0 ? (
                <p className="py-4 text-[13px] text-ink-3">
                  {t("parentDashboard.noGrades")}
                </p>
              ) : (
                <ul className="rounded-xl border border-rule bg-sheet">
                  {recentGrades.map((g: any, i: number) => {
                    const myScore = g.scores?.[0];
                    const pct = myScore
                      ? Math.round((myScore.score / g.maxScore) * 100)
                      : 0;
                    return (
                      <li
                        key={g._id || i}
                        className="flex items-center justify-between gap-3 border-b border-rule-2 px-4 py-2.5 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium text-ink">
                            {g.name}
                          </div>
                          <div className="text-[11px] text-ink-3">
                            {g.subject || g.courseName || ""}
                          </div>
                        </div>
                        <Figure className="text-[13px] font-semibold text-ink">
                          {pct}%
                        </Figure>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <SectionHead
                eyebrow={t("parentDashboard.latestEyebrow")}
                title={t("parentDashboard.recentPayments")}
              />
              {recentPayments.length === 0 ? (
                <p className="py-4 text-[13px] text-ink-3">
                  {t("parentDashboard.noPayments")}
                </p>
              ) : (
                <ul className="rounded-xl border border-rule bg-sheet">
                  {recentPayments.map((p: any, i: number) => (
                    <li
                      key={p._id || i}
                      className="flex items-center justify-between gap-3 border-b border-rule-2 px-4 py-2.5 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium text-ink">
                          {p.courseName ?? t("parentDashboard.payment")}
                        </div>
                        <div className="text-[11px] text-ink-3">
                          {p.paidAt ? (
                            <Figure>{formatDate(p.paidAt)}</Figure>
                          ) : (
                            "—"
                          )}
                        </div>
                      </div>
                      <Money amount={p.amount} format={formatEGP} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="flex flex-col gap-3">
            <SectionHead
              eyebrow={t("parentDashboard.trendsEyebrow")}
              title={t("parentDashboard.paidVsDue")}
            />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className="rounded-xl border border-rule bg-sheet p-4">
                <div dir="ltr">
                  <ProgressArcChart
                    percent={paidRatio}
                    color="var(--series-2)"
                    label={t("parentDashboard.paidCoverage")}
                    subLabel={`${formatEGP(paid)} ${t("parentDashboard.paidLabel")} / ${formatEGP(pendingAmount)} ${t("parentDashboard.dueLabel")}`}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-rule bg-sheet p-4">
                <span className="eyebrow">
                  {t("parentDashboard.attendanceTrend")}
                </span>
                <div className="mt-3" dir="ltr">
                  <LineChart
                    series={attendanceTrend}
                    showArea
                    yValueFormatter={(value) => `${Math.round(value)}%`}
                    emptyText={t("parentDashboard.noAttendanceTrend")}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-rule bg-sheet p-4">
                <span className="eyebrow">
                  {t("parentDashboard.gradeTrend")}
                </span>
                <div className="mt-3" dir="ltr">
                  <LineChart
                    series={gradeTrend}
                    showArea
                    yValueFormatter={(value) => `${Math.round(value)}%`}
                    emptyText={t("parentDashboard.noGradeTrend")}
                  />
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
