"use client";

import { BarChart, DonutChart, LineChart } from "@/components/charts";
import { StatCard } from "@/components/kit/stat-card";
import { TeamNotesBoard } from "@/features/team-notes/team-notes-board";
import { PageSkeleton } from "@/components/ui/skeletons";
import { revenueVsExpensesLineSeries, sessionStatusDonutData } from "@/lib/analytics/transforms";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useCustom } from "@refinedev/core";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Progress } from "@repo/ui/components/progress";
import { BookOpen, GraduationCap, Users, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";

interface DashboardData {
  totals: {
    students: number;
    teachers: number;
    activeCourses: number;
    revenue: number;
  };
  attendanceRate: number;
  todaySessions: any[];
  feeDefaulters: number;
  pendingEnrollmentRequests: number;
  analytics?: {
    revenueVsExpenses?: Array<{ label: string; revenue: number; expenses: number; netProfit: number }>;
    sessionStatusMix?: Array<{ status: "scheduled" | "completed" | "cancelled" | "postponed"; count: number }>;
    attendanceByCourse?: Array<{ title: string; attendanceRatePct: number }>;
  };
}

export function AdminDashboard() {
  const t = useTranslations();
  const { formatEGP, formatShortEGP } = useFormatters();
  const { query, result } = useCustom<DashboardData>({
    url: "dashboards/admin",
    method: "get",
  });

  const d = result?.data as DashboardData | undefined;

  if (query.isLoading) {
    return <PageSkeleton />;
  }

  const totals = d?.totals ?? { students: 0, teachers: 0, activeCourses: 0, revenue: 0 };
  const attendanceRate = d?.attendanceRate ?? 0;
  const activeSessions = d?.todaySessions?.length ?? 0;
  const feeDefaulters = d?.feeDefaulters ?? 0;
  const pendingRequests = d?.pendingEnrollmentRequests ?? 0;

  return (
    <div className="space-y-6">
      {/* The center team's shared to-do board (owner + staff). */}
      <TeamNotesBoard compact />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("adminHome.dashboard_totalStudents")}
          value={totals.students}
          icon={Users}
        />
        <StatCard label={t("nav.teachers")} value={totals.teachers} icon={GraduationCap} />
        <StatCard
          label={t("adminHome.dashboard_activeClasses")}
          value={totals.activeCourses}
          icon={BookOpen}
        />
        <StatCard
          label={t("adminHome.dashboard_totalRevenue")}
          value={formatEGP(totals.revenue)}
          icon={Wallet}
          accent
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        <Card className="md:col-span-7">
          <CardHeader>
            <CardTitle>{t("adminHome.dashboard_todaysSnapshot")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {t("adminHome.dashboard_attendanceRate")}
                </p>
                <p className="text-2xl font-bold tabular-nums text-foreground">
                  {attendanceRate}
                  <span className="ms-0.5 text-base font-normal text-muted-foreground">%</span>
                </p>
                <Progress
                  value={attendanceRate}
                  className="[&_[data-slot=progress-indicator]]:bg-success"
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {t("adminHome.dashboard_activeSessions")}
                </p>
                <p className="text-2xl font-bold tabular-nums text-foreground">{activeSessions}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-5">
          <CardHeader>
            <CardTitle>{t("adminHome.dashboard_pendingActions")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {[
                { label: t("adminHome.dashboard_feeDefaulters"), count: feeDefaulters },
                { label: t("adminHome.dashboard_pendingEnrollmentRequests"), count: pendingRequests },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2">
                  <span className="text-sm">{item.label}</span>
                  <span className="font-semibold tabular-nums">{item.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("adminHome.dashboard_revenueVsExpensesTrend")}</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart
              series={revenueVsExpensesLineSeries(
                (d?.analytics?.revenueVsExpenses ?? []).map((entry) => ({
                  period: entry.label,
                  label: entry.label,
                  revenue: entry.revenue,
                  expenses: entry.expenses,
                  netProfit: entry.netProfit,
                })),
              )}
              showArea
              yValueFormatter={(value) => formatShortEGP(value)}
              emptyText={t("adminHome.dashboard_noFinancialTrend")}
            />
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{t("adminHome.dashboard_sessionStatusMix")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={sessionStatusDonutData(d?.analytics?.sessionStatusMix ?? [])}
              centerLabel={t("nav.sessions")}
              emptyText={t("adminHome.dashboard_noSessionStatus")}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("adminHome.dashboard_attendanceByCourse")}</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            data={(d?.analytics?.attendanceByCourse ?? []).map((entry) => ({
              label: entry.title,
              rate: entry.attendanceRatePct,
            }))}
            series={[
              { key: "rate", label: t("adminHome.dashboard_attendancePercent"), color: "var(--success)" },
            ]}
            horizontal
            yValueFormatter={(value) => `${Math.round(value)}%`}
            emptyText={t("adminHome.dashboard_noCourseAttendance")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
