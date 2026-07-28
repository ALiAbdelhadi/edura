"use client";

// Attendance — read-only summary. Rendered by the student, parent, teacher and
// assistant portals, so it carries no portal-specific chrome.
//
// Colour here is the status itself, not decoration: teal = present (confirmed),
// amber = late (partial), red = absent (the terminal negative outcome, and the
// one a parent is scanning for). Three states, three tokens, no fourth hue.
import { useCustom } from "@refinedev/core";
import { Calendar } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@repo/ui/lib/utils";
import {
  Figure,
  Metric,
  SectionHead,
  SkeletonRows,
} from "@repo/ui/components/ledger";
import { EmptyState } from "@/components/kit/empty-state";
import { HeatmapCalendar } from "@/components/charts";
import { attendanceRecordsToHeatmapCells } from "@/lib/analytics/transforms";

export function AttendanceScreen({ studentId }: { studentId?: string } = {}) {
  const t = useTranslations();
  const url = studentId ? `me/attendance?studentId=${studentId}` : "me/attendance";
  const { query, result } = useCustom({ url, method: "get" });
  const summary = (result?.data as any) || null;

  if (query.isLoading) return <SkeletonRows rows={4} />;

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

  const sortedDates = Array.from(dateStatusMap.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const recentDates = sortedDates.slice(-28);

  const statusConfig = {
    present: { label: t("status.present"), dot: "bg-teal" },
    absent: { label: t("status.absent"), dot: "bg-red" },
    late: { label: t("status.late"), dot: "bg-amber" },
  } as const;

  // The denominator is the point: "4 absences" means nothing without "of 62".
  const outOf = total > 0 ? t("attendanceView.outOf", { count: total }) : undefined;

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric
          label={t("studentClass.presentDays")}
          value={<Figure className="text-teal">{present}</Figure>}
          reason={outOf}
        />
        <Metric
          label={t("studentClass.lateExcused")}
          value={<Figure className="text-amber">{late}</Figure>}
          reason={outOf}
        />
        <Metric
          label={t("studentClass.absentDays")}
          value={<Figure className="text-red">{absent}</Figure>}
          reason={outOf}
        />
      </div>

      <section className="flex flex-col gap-3">
        <SectionHead
          eyebrow={t("attendanceView.recentEyebrow")}
          title={t("studentClass.heatmapTitle")}
        />
        <div className="rounded-xl border border-rule bg-sheet p-4">
          {recentDates.length === 0 ? (
            <EmptyState icon={Calendar} title={t("studentClass.noAttendance")} />
          ) : (
            <div className="flex w-full flex-col gap-3">
              {/* The calendar is a time axis: it reads left-to-right in both
                  locales, so the island is LTR while the card stays RTL. */}
              <div dir="ltr">
                <HeatmapCalendar
                  cells={attendanceRecordsToHeatmapCells(
                    recentDates.map(([date, status]) => ({ date, status })),
                  )}
                  emptyText={t("studentClass.noAttendance")}
                />
              </div>
              <ul className="flex flex-wrap items-center gap-4">
                {(["present", "late", "absent"] as const).map((status) => (
                  <li
                    key={status}
                    className="flex items-center gap-1.5 text-[11px] text-ink-2"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 rounded-sm",
                        statusConfig[status].dot,
                      )}
                    />
                    {statusConfig[status].label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
