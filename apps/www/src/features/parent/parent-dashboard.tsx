"use client";

import React from "react";
import { useList, useCustom } from "@refinedev/core";
import { CheckCircle2, Trophy, DollarSign, Bell, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { cn } from "@repo/ui/lib/utils";
import { StatCard } from "@/components/kit/stat-card";
import { StatusBadge } from "@/components/kit/status-badge";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner } from "@/components/kit/spinner";
import { LineChart, ProgressArcChart } from "@/components/charts";
import { useChildSelector, ChildSelectorBar } from "@/components/ui/child-selector";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
export function ParentDashboard() {
  const t = useTranslations();
  const { formatEGP, formatDate } = useFormatters();
  const { childId, isLoading: childrenLoading } = useChildSelector();

  const { query: gradesQuery, result: gradesResult } = useList({
    resource: "grades",
    filters: childId ? [{ field: "studentId", operator: "eq", value: childId }] : undefined,
    queryOptions: { enabled: !!childId },
  });

  const { query: paymentsQuery, result: paymentsResult } = useList({
    resource: "payments",
    filters: childId ? [{ field: "studentId", operator: "eq", value: childId }] : undefined,
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

  const isLoading = childrenLoading || gradesQuery.isLoading || paymentsQuery.isLoading || enrollmentsQuery.isLoading || attendanceQuery.isLoading;

  const courseMap = new Map<string, { scores: { score: number; max: number }[] }>();
  for (const g of grades) {
    if (!courseMap.has(g.courseId)) courseMap.set(g.courseId, { scores: [] });
    const myScore = g.scores?.[0];
    if (myScore) courseMap.get(g.courseId)!.scores.push({ score: myScore.score, max: g.maxScore });
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
  const paid = payments.filter((p: any) => p.amount > 0).reduce((a: number, b: any) => a + b.amount, 0);
  const owed = enrollments.reduce((a: number, b: any) => a + (b.coursePrice ?? 0), 0);
  const pendingAmount = Math.max(owed - netPaid, 0);

  const recentGrades = grades.slice(-3);
  const recentPayments = payments.slice(-3);

  const attendanceTrend = React.useMemo(() => {
    const records = (attendance?.records ?? []) as Array<{ date: string; status: "present" | "absent" | "late" }>;
    const byDay = records
      .slice(-14)
      .map((record) => ({
        x: formatDate(`${record.date}T00:00:00`, { month: "short", day: "numeric" }),
        value: record.status === "present" ? 100 : record.status === "late" ? 60 : 0,
      }));
    return [{ id: "attendance", label: t("parentDashboard.attendanceLabel"), color: "var(--success)", points: byDay }];
  }, [attendance, t, formatDate]);

  const gradeTrend = React.useMemo(() => {
    const ordered = [...grades]
      .filter((g: any) => g.date)
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-12)
      .map((grade: any) => {
        const score = grade.scores?.[0];
        const value = score ? Math.round((score.score / (grade.maxScore || 1)) * 100) : 0;
        return {
          x: formatDate(grade.date, { month: "short", day: "numeric" }),
          value,
        };
      });
    return [{ id: "grades", label: t("parentDashboard.gradePercentLabel"), color: "var(--info)", points: ordered }];
  }, [grades, t, formatDate]);

  const totalFees = paid + pendingAmount;
  const paidRatio = totalFees > 0 ? (paid / totalFees) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("roles.parent")}
        title={t("nav.dashboard")}
        actions={<ChildSelectorBar />}
      />

      {isLoading ? (
        <PageSpinner label={t("parentDashboard.loadingDashboard")} />
      ) : !childId ? (
        <EmptyState icon={Users} title={t("parentDashboard.noChildren")} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={t("parentDashboard.attendanceRate")}
              value={attendance?.rate ?? 0}
              unit="%"
              icon={CheckCircle2}
              accent
            />
            <StatCard
              label={t("parentDashboard.averageGrade")}
              value={overallAvg}
              unit="%"
              icon={Trophy}
            />
            <StatCard
              label={t("parentDashboard.feesPaid")}
              value={<span className="text-success">{formatEGP(paid)}</span>}
              icon={DollarSign}
            />
            <StatCard
              label={t("parentDashboard.feesDue")}
              value={<span className="text-destructive">{formatEGP(pendingAmount)}</span>}
              icon={Bell}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("parentDashboard.recentGrades")}</CardTitle>
              </CardHeader>
              <CardContent>
                {recentGrades.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">{t("parentDashboard.noGrades")}</div>
                ) : (
                  <div className="divide-y divide-border">
                    {recentGrades.map((g: any, i: number) => {
                      const myScore = g.scores?.[0];
                      const pct = myScore ? Math.round((myScore.score / g.maxScore) * 100) : 0;
                      return (
                        <div key={g._id || i} className="flex items-center justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-foreground">{g.name}</div>
                            <div className="text-xs text-muted-foreground">{g.subject || g.courseName || ""}</div>
                          </div>
                          <StatusBadge tone={pct >= 90 ? "success" : pct >= 75 ? "info" : "warning"}>
                            <span dir="ltr">{pct}%</span>
                          </StatusBadge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("parentDashboard.recentPayments")}</CardTitle>
              </CardHeader>
              <CardContent>
                {recentPayments.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">{t("parentDashboard.noPayments")}</div>
                ) : (
                  <div className="divide-y divide-border">
                    {recentPayments.map((p: any, i: number) => {
                      const isRefund = p.amount < 0;
                      return (
                        <div key={p._id || i} className="flex items-center justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-foreground">{p.courseName ?? t("parentDashboard.payment")}</div>
                            <div className="text-xs text-muted-foreground">{p.paidAt ? formatDate(p.paidAt) : "—"}</div>
                          </div>
                          <span dir="ltr" className={cn("font-semibold", isRefund ? "text-warning" : "text-success")}>
                            {isRefund ? "−" : ""}{formatEGP(Math.abs(p.amount))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>{t("parentDashboard.paidVsDue")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ProgressArcChart
                  percent={paidRatio}
                  color="var(--success)"
                  label={t("parentDashboard.paidCoverage")}
                  subLabel={`${formatEGP(paid)} ${t("parentDashboard.paidLabel")} / ${formatEGP(pendingAmount)} ${t("parentDashboard.dueLabel")}`}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("parentDashboard.attendanceTrend")}</CardTitle>
              </CardHeader>
              <CardContent>
                <LineChart
                  series={attendanceTrend}
                  showArea
                  yValueFormatter={(value) => `${Math.round(value)}%`}
                  emptyText={t("parentDashboard.noAttendanceTrend")}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("parentDashboard.gradeTrend")}</CardTitle>
              </CardHeader>
              <CardContent>
                <LineChart
                  series={gradeTrend}
                  showArea
                  yValueFormatter={(value) => `${Math.round(value)}%`}
                  emptyText={t("parentDashboard.noGradeTrend")}
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
