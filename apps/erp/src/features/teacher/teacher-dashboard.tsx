"use client";

import { useCustom } from "@refinedev/core";
import { Link } from "@/i18n/navigation";
import { Calendar, FileText, Users, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { StatCard } from "@/components/kit/stat-card";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import { BarChart, LineChart } from "@/components/charts";
import { teacherAttendanceLineSeries, teacherGradeLoadBarData } from "@/lib/analytics/transforms";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { PageSkeleton } from "@/components/ui/skeletons";
import { asRecord } from "@/lib/refine/as-record";
import { GuidedTour } from "@/features/tour/guided-tour";
import { useTourGate } from "@/features/tour/use-tour-gate";
import { TEACHER_TOUR_STEPS } from "@/features/teacher/tour/steps";

export function TeacherDashboard() {
  const t = useTranslations();
  const { formatPercent } = useFormatters();
  const { result } = useCustom({ url: "dashboards/teacher", method: "get" });
  // Declared with the other hooks: the gate cannot sit behind the loading
  // branch below, or the tour would never mount while data is in flight.
  const tour = useTourGate();
  // The payload and the guard read the SAME value — see student-dashboard.
  const payload = asRecord<any>(result?.data);
  const data = payload ?? {};

  // Keyed on the payload, not isLoading — see student-dashboard.
  if (!payload) {
    return <PageSkeleton />;
  }

  const scheduleColumns: ColumnDef<any>[] = [
    { accessorKey: "time", header: t("teacher.time") },
    {
      id: "duration",
      header: t("teacher.duration"),
      cell: ({ row }) => {
        const mins = row.original.durationMinutes;
        if (mins) return t("teacher.durationMins", { mins });
        return <span dir="ltr">{row.original.duration || "—"}</span>;
      },
    },
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
      {/* First entry only: the guided tour of the REAL portal offers itself
          once, then never again (user_prefs.tour_completed).

          It replaces the emulator as the first-run surface, matching the
          student and parent portals: a tour is the right thing to MEET someone
          with (a minute, pointing at their own screen), and the emulator is the
          right thing to CHOOSE (ten minutes, a simulated world). The emulator
          is not lost — it keeps its permanent entry in the menu, now labelled
          "Practice", and this tour's last card points at it. Both cannot open
          on first run, because both read the same `tour_completed` flag. */}
      <GuidedTour
        steps={TEACHER_TOUR_STEPS}
        namespace="teacher.teacherTour"
        open={tour.shouldOpen}
        onClose={tour.markDone}
      />

      {/*
        AN INDEX, NOT A DEAD END. Each figure opens the page that owns it —
        the same rule the student and parent homes now follow.

        AND ONE CHART WENT WITH IT: a "score distribution" card used to sit at
        the bottom of this dashboard, rendering the SAME chart, under the same
        title, in the same colour, as the one on /grades — except the gradebook's
        carries a per-assessment picker and this one could not be narrowed at
        all. Two answers to one question, and the weaker one came first. The
        remaining two charts stay: the weekly attendance trend and the
        pending-vs-graded load exist on no other screen.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/dashboard/teacher/attendance" className="block">
          <StatCard
            className="h-full"
            label={t("teacher.classesToday")}
            value={data.todaySessions?.length ?? 0}
            icon={Calendar}
            accent
          />
        </Link>
        <Link href="/dashboard/teacher/grades" className="block">
          <StatCard
            className="h-full"
            label={t("teacher.pendingGrades")}
            value={data.pendingGradeEntries ?? 0}
            icon={FileText}
          />
        </Link>
        <Link href="/dashboard/teacher/classes" className="block">
          <StatCard
            className="h-full"
            label={t("teacher.totalStudents")}
            value={data.activeStudents ?? 0}
            icon={Users}
          />
        </Link>
        <Link href="/dashboard/teacher/attendance" className="block">
          <StatCard
            className="h-full"
            label={t("teacher.attendancePct")}
            value={formatPercent(data.avgAttendanceRate ?? 0)}
            icon={CheckCircle2}
          />
        </Link>
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
              yValueFormatter={(value) => formatPercent(Math.round(value))}
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

    </div>
  );
}
