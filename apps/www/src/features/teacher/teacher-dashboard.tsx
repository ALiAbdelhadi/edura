"use client";

import { useCustom } from "@refinedev/core";
import { Calendar, FileText, Users, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { StatCard } from "@/components/kit/stat-card";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import { BarChart, LineChart } from "@/components/charts";
import { scoreDistributionBarData, teacherAttendanceLineSeries, teacherGradeLoadBarData } from "@/lib/analytics/transforms";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { PageSkeleton } from "@/components/ui/skeletons";
import { asRecord } from "@/lib/refine/as-record";

export function TeacherDashboard() {
  const t = useTranslations();
  const { formatPercent } = useFormatters();
  const { result } = useCustom({ url: "dashboards/teacher", method: "get" });
  // The payload and the guard read the SAME value — see student-dashboard.
  const payload = asRecord<any>(result?.data);
  const data = payload ?? {};

  // Keyed on the payload, not isLoading — see student-dashboard.
  if (!payload) {
    return <PageSkeleton />;
  }

  const scheduleColumns: ColumnDef<any>[] = [
    { accessorKey: "time", header: t("teacher.time") },
    { accessorKey: "duration", header: t("teacher.duration") },
    { accessorKey: "subject", header: t("teacher.subject") },
    { accessorKey: "room", header: t("teacher.room") },
    {
      id: "status",
      header: t("teacher.status"),
      cell: ({ row }) => {
        const s = row.original;
        const tone: StatusTone =
          s.status === "taught" ? "success" : s.status === "cancelled" ? "danger" : "info";
        return (
          <StatusBadge tone={tone}>
            {s.status === "taught"
              ? t("teacher.done")
              : s.status === "cancelled"
                ? t("status.cancelled")
                : t("teacher.upcoming")}
          </StatusBadge>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("teacher.classesToday")}
          value={data.todaySessions?.length ?? 0}
          icon={Calendar}
          accent
        />
        <StatCard
          label={t("teacher.pendingGrades")}
          value={data.pendingGradeEntries ?? 0}
          icon={FileText}
        />
        <StatCard
          label={t("teacher.totalStudents")}
          value={data.activeStudents ?? 0}
          icon={Users}
        />
        <StatCard
          label={t("teacher.attendancePct")}
          value={formatPercent(data.avgAttendanceRate ?? 0)}
          icon={CheckCircle2}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("teacher.todaySchedule")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={scheduleColumns}
            data={data.todaySessions || []}
            pageSize={100}
            emptyState={t("teacher.noClassesToday")}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>{t("teacher.weeklyAttendanceTrend")}</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart
              series={teacherAttendanceLineSeries(data.analytics?.attendanceTrend ?? [])}
              showArea
              yValueFormatter={(value) => `${Math.round(value)}%`}
              emptyText={t("teacher.noAttendanceTrend")}
            />
          </CardContent>
        </Card>
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>{t("teacher.pendingVsGraded")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={teacherGradeLoadBarData((data.analytics?.gradeLoad ?? []).slice(0, 8))}
              series={[
                { key: "pending", label: t("teacher.pending"), color: "var(--warning)" },
                { key: "graded", label: t("teacher.graded"), color: "var(--success)" },
              ]}
              stacked
              emptyText={t("teacher.noGradeLoad")}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("teacher.scoreDistribution")}</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            data={scoreDistributionBarData(data.analytics?.scoreDistribution ?? [])}
            series={[{ key: "count", label: t("teacher.scores"), color: "var(--primary)" }]}
            emptyText={t("teacher.noDistribution")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
