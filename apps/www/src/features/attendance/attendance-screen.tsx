"use client";

import { useCustom } from "@refinedev/core";
import { CheckCircle2, XCircle, Clock, Calendar } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@repo/ui/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { StatCard } from "@/components/kit/stat-card";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner } from "@/components/kit/spinner";
import { HeatmapCalendar } from "@/components/charts";
import { attendanceRecordsToHeatmapCells } from "@/lib/analytics/transforms";

export function AttendanceScreen({ studentId }: { studentId?: string } = {}) {
  const t = useTranslations();
  const url = studentId ? `me/attendance?studentId=${studentId}` : "me/attendance";
  const { query, result } = useCustom({ url, method: "get" });
  const summary = (result?.data as any) || null;

  if (query.isLoading) {
    return <PageSpinner label={t("common.loading")} />;
  }

  const present = summary?.present ?? 0;
  const absent = summary?.absent ?? 0;
  const late = summary?.late ?? 0;
  const total = summary?.total ?? 0;

  const dateStatusMap = new Map<string, "present" | "absent" | "late">();
  for (const rec of summary?.records ?? []) {
    if (!rec.date) continue;
    const status = rec.status as "present" | "absent" | "late";
    const priority: Record<string, number> = { absent: 2, late: 1, present: 0 };
    const existing = dateStatusMap.get(rec.date);
    if (!existing || (priority[status] ?? 0) > (priority[existing] ?? 0)) {
      dateStatusMap.set(rec.date, status);
    }
  }

  const sortedDates = Array.from(dateStatusMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  const recentDates = sortedDates.slice(-28);

  const statusConfig = {
    present: { label: t("status.present"), dot: "bg-success" },
    absent: { label: t("status.absent"), dot: "bg-destructive" },
    late: { label: t("status.late"), dot: "bg-warning" },
  } as const;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t("studentClass.presentDays")} value={present} icon={CheckCircle2} />
        <StatCard label={t("studentClass.absentDays")} value={absent} icon={XCircle} />
        <StatCard label={t("studentClass.lateExcused")} value={late} icon={Clock} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("studentClass.heatmapTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {recentDates.length === 0 ? (
            <EmptyState icon={Calendar} title={t("studentClass.noAttendance")} />
          ) : (
            <div className="flex w-full flex-col gap-3">
              <HeatmapCalendar
                cells={attendanceRecordsToHeatmapCells(
                  recentDates.map(([date, status]) => ({ date, status })),
                )}
                emptyText={t("studentClass.noAttendance")}
              />
              <div className="flex flex-wrap items-center gap-4">
                {(["present", "late", "absent"] as const).map((status) => (
                  <span
                    key={status}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <span className={cn("size-2.5 rounded-full", statusConfig[status].dot)} />
                    {statusConfig[status].label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
