"use client";

import { DonutChart, HeatmapCalendar } from "@/components/charts";
import { EmptyState } from "@/components/kit/empty-state";
import { attendanceDayCells } from "@/lib/analytics/transforms";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useCustom } from "@refinedev/core";
import { SectionHead, SkeletonRows } from "@repo/ui/components/ledger";
import { QuerySection } from "@repo/ui/components/query-section";
import { cn } from "@repo/ui/lib/utils";
import { Calendar } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

type Status = "present" | "absent" | "late";

const DAYS = 28;

export function AttendanceScreen({
  studentId,
  recent,
}: {
  studentId?: string;
  recent?: ReactNode;
} = {}) {
  const t = useTranslations();
  const { locale, formatDate, formatNumber, formatPercent } = useFormatters();
  const url = studentId ? `me/attendance?studentId=${studentId}` : "me/attendance";
  const { query, result } = useCustom({ url, method: "get" });
  const summary = (result?.data as any) || null;

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

    none: { label: t("attendanceView.noSession"), swatch: "ring-1 ring-rule-2" },
  } as const;
  const outOf = total > 0 ? t("attendanceView.outOf", { count: total }) : undefined;

  const DONUT_COLOR = { present: "var(--teal)", late: "var(--amber)", absent: "var(--red)" } as const;
  const donutData = (["present", "late", "absent"] as const).map((status) => {
    const value = { present, late, absent }[status];
    const pct = total > 0 ? (value / total) * 100 : 0;
    return {
      id: status,
      label: `${statusConfig[status].label} — ${formatPercent(pct, { decimals: 1 })}`,
      value,
      color: DONUT_COLOR[status],
    };
  });

  const cells = attendanceDayCells(
    records.filter((r): r is { date: string; status: Status } => Boolean(r.date)),
    {
      days: DAYS,
      formatDayNumber: (date) =>
        new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en").format(date.getDate()),
      describe: (date, status) =>
        `${formatDate(date, { weekday: "long", day: "numeric", month: "long" })} — ${
          status ? statusConfig[status].label : statusConfig.none.label
        }`,
    },
  );

  return (
    <QuerySection query={query} skeleton={<SkeletonRows rows={4} />}>
    <div className="flex w-full flex-col gap-5">
      <div className="rounded-xl border border-rule bg-sheet p-4">
        <DonutChart
          data={donutData}
          centerLabel={outOf}
          emptyText={t("studentClass.noAttendance")}
          formatValue={formatNumber}
          height={220}
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
    </QuerySection>
  );
}
