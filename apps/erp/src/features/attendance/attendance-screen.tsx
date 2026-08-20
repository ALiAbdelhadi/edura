"use client";

// Attendance — read-only summary. Rendered by the student, parent, teacher and
// assistant portals, so it carries no portal-specific chrome.
//
// Colour here is the status itself, not decoration: teal = present (confirmed),
// amber = late (partial), red = absent (the terminal negative outcome, and the
// one a parent is scanning for). Three states, three tokens, no fourth hue —
// and a fourth TONE, `none`, which is not a status at all but the absence of
// one. See `attendanceDayCells` for why that distinction is load-bearing.
import type { ReactNode } from "react";
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
import { attendanceDayCells } from "@/lib/analytics/transforms";
import { useFormatters } from "@/lib/i18n/use-formatters";

type Status = "present" | "absent" | "late";

const DAYS = 28;

export function AttendanceScreen({
  studentId,
  recent,
}: {
  studentId?: string;
  /**
   * A slot between the three figures and the month pattern.
   *
   * WHY A SLOT AND NOT A LIST BUILT IN HERE: naming a lesson needs course
   * titles, and `me/attendance` returns `courseId` only. The student portal can
   * resolve those from the `enrollments` it already reads; a PARENT cannot —
   * their own enrollments are not their child's — so a list built into this
   * shared screen would print the right dates against the wrong subjects for
   * one of its two callers. The caller that can name the courses passes the
   * list; the one that cannot passes nothing and loses nothing.
   *
   * It sits ABOVE the heatmap deliberately. "حضرت كام حصة" is answered by the
   * three figures and then by named lessons; the 28-day grid is a PATTERN, and
   * a pattern is what you look at second.
   */
  recent?: ReactNode;
} = {}) {
  const t = useTranslations();
  const { locale, formatDate } = useFormatters();
  const url = studentId ? `me/attendance?studentId=${studentId}` : "me/attendance";
  const { query, result } = useCustom({ url, method: "get" });
  const summary = (result?.data as any) || null;

  if (query.isLoading) return <SkeletonRows rows={4} />;

  const present = summary?.present ?? 0;
  const absent = summary?.absent ?? 0;
  const late = summary?.late ?? 0;
  const total = summary?.total ?? 0;

  const records = (summary?.records ?? []) as Array<{ date?: string; status: Status }>;
  const hasRecords = records.some((r) => Boolean(r.date));

  const statusConfig = {
    present: { label: t("status.present"), swatch: "bg-teal-soft ring-1 ring-teal" },
    late: { label: t("status.late"), swatch: "bg-amber-soft ring-1 ring-amber" },
    absent: { label: t("status.absent"), swatch: "bg-red-soft ring-1 ring-red" },
    // The quiet fourth. Listed because a reader who cannot tell "no lesson"
    // from "not recorded" will read every gap as a gap in the RECORD.
    none: { label: t("attendanceView.noSession"), swatch: "ring-1 ring-rule-2" },
  } as const;

  // The denominator is the point: "4 absences" means nothing without "of 62".
  const outOf = total > 0 ? t("attendanceView.outOf", { count: total }) : undefined;

  const cells = attendanceDayCells(
    records.filter((r): r is { date: string; status: Status } => Boolean(r.date)),
    {
      days: DAYS,
      // The day number only — a date inside a 40px cell is unreadable, and the
      // full date is one hover or one screen-reader stop away.
      formatDayNumber: (date) =>
        new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en").format(date.getDate()),
      describe: (date, status) =>
        `${formatDate(date, { weekday: "long", day: "numeric", month: "long" })} — ${
          status ? statusConfig[status].label : statusConfig.none.label
        }`,
    },
  );

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

      {recent}

      <section className="flex flex-col gap-3">
        <SectionHead
          eyebrow={t("attendanceView.recentEyebrow")}
          title={t("studentClass.heatmapTitle")}
        />
        <div className="rounded-xl border border-rule bg-sheet p-4">
          {!hasRecords ? (
            <EmptyState icon={Calendar} title={t("studentClass.noAttendance")} />
          ) : (
            <div className="flex w-full flex-col gap-3">
              {/* The calendar is a time axis: it reads left-to-right in both
                  locales. ChartFrame owns that island — no second dir here. */}
              <HeatmapCalendar cells={cells} emptyText={t("studentClass.noAttendance")} />
              <ul className="flex flex-wrap items-center gap-4">
                {(["present", "late", "absent", "none"] as const).map((status) => (
                  <li
                    key={status}
                    className="flex items-center gap-1.5 text-[11px] text-ink-2"
                  >
                    <span
                      aria-hidden
                      className={cn("size-2.5 rounded-sm", statusConfig[status].swatch)}
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
