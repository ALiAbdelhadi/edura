"use client";

import { useCustom } from "@refinedev/core";
import { CheckCircle2, FileText, Trophy, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Progress } from "@repo/ui/components/progress";
import { StatCard } from "@/components/kit/stat-card";
import { GuardianContactNotice } from "@/features/student/guardian-contact-notice";
import { PageHeader } from "@/components/kit/page-header";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { StatusBadge } from "@/components/kit/status-badge";
import { EmptyState } from "@/components/kit/empty-state";
import { BarChart, LineChart } from "@/components/charts";
import { assignmentsTrendBarData, studentGradeTrendLineSeries } from "@/lib/analytics/transforms";
import { useTranslations } from "next-intl";
import { PageSkeleton } from "@/components/ui/skeletons";

export function StudentDashboard() {
  const t = useTranslations();
  const { query, result } = useCustom({ url: "dashboards/student", method: "get" });
  const data = (result?.data as any) ?? {};

  if (query.isLoading && !result?.data) {
    return <PageSkeleton />;
  }

  const scheduleColumns: ColumnDef<any>[] = [
    { accessorKey: "time", header: t("studentDashboard.time") },
    { accessorKey: "subject", header: t("studentDashboard.subject") },
    { accessorKey: "room", header: t("studentDashboard.room") },
    { accessorKey: "teacher", header: t("studentDashboard.teacher") },
  ];

  const dueColumns: ColumnDef<any>[] = [
    { accessorKey: "title", header: t("studentDashboard.assignment") },
    { accessorKey: "subject", header: t("studentDashboard.subject") },
    {
      id: "due",
      header: t("studentDashboard.due"),
      cell: ({ row }) => (
        <StatusBadge tone={row.original.urgent ? "danger" : "neutral"}>
          {row.original.due}
        </StatusBadge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.dashboard")} description={t("studentDashboard.subtitle")} />

      {/* Child safety: explains WHY adult messaging is off, and fixes it. */}
      <GuardianContactNotice />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("studentDashboard.attendanceRate")}
          value={data.attendanceRate ?? 0}
          unit="%"
          icon={CheckCircle2}
          filled
        />
        <StatCard
          label={t("studentDashboard.assignmentsDue")}
          value={data.assignmentsDue ?? 0}
          icon={FileText}
        />
        <StatCard
          label={t("studentDashboard.averageGrade")}
          value={data.averageGrade ?? "—"}
          icon={Trophy}
        />
        <StatCard
          label={t("studentDashboard.unreadMessages")}
          value={data.unreadMessages ?? 0}
          icon={MessageSquare}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader>
            <CardTitle>{t("studentDashboard.todaySchedule")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={scheduleColumns}
              data={data.todaySchedule || []}
              pageSize={100}
              emptyState={t("studentDashboard.noClassesToday")}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>{t("studentDashboard.dueSoon")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={dueColumns}
              data={data.dueSoon || []}
              pageSize={100}
              emptyState={t("studentDashboard.noUpcomingAssignments")}
            />
            <div className="mt-4 space-y-2">
              <p className="text-xs text-muted-foreground">
                {t("studentDashboard.overallCompletion")}
              </p>
              <Progress value={data.overallCompletion || 0} />
              <p className="text-xs text-muted-foreground">
                <span dir="ltr">{data.overallCompletion}%</span>{" "}
                {t("studentDashboard.thisSemester")}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("studentDashboard.subjectPerformance")}</CardTitle>
        </CardHeader>
        <CardContent>
          {(data.subjectPerformance || []).length === 0 ? (
            <EmptyState icon={Trophy} title={t("studentDashboard.noPerformanceData")} />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {(data.subjectPerformance || []).map((s: any, i: number) => (
                <Card key={s.id || i}>
                  <CardContent className="space-y-1 p-4">
                    <div className="text-2xl font-bold tabular-nums text-primary">
                      {s.grade}
                    </div>
                    <div className="font-semibold text-foreground">{s.subject}</div>
                    <Progress value={s.percentage} className="h-1.5" />
                    <div className="text-xs tabular-nums text-primary">{s.percentage}%</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>{t("studentDashboard.gradeTrend")}</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart
              series={studentGradeTrendLineSeries(data.analytics?.gradeTrend ?? [])}
              showArea
              yValueFormatter={(value) => `${Math.round(value)}%`}
              emptyText={t("studentDashboard.noGradeTrend")}
            />
          </CardContent>
        </Card>
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>{t("studentDashboard.assignmentProgressTrend")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={assignmentsTrendBarData(data.analytics?.assignmentsTrend ?? [])}
              series={[
                { key: "pending", label: t("studentDashboard.pending"), color: "var(--warning)" },
                { key: "graded", label: t("studentDashboard.graded"), color: "var(--success)" },
              ]}
              stacked
              emptyText={t("studentDashboard.noAssignmentTrend")}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
