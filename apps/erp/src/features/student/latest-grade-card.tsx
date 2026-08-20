"use client";

import { ChevronRight } from "lucide-react";
import { useList } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { DirectionalIcon } from "@repo/ui/components/directional-icon";
import { Link } from "@/i18n/navigation";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { Chip, Eyebrow, Num, Sheet } from "@/features/student/ledger";
import { latestGrade, type GradeRow } from "@/features/student/grades";

/** One band, one colour, everywhere — see `grades-screen.tsx` for the mapping. */
const CHIP_TONE = {
  success: "teal",
  info: "indigo",
  neutral: "neutral",
  warning: "amber",
  danger: "red",
} as const;

/**
 * آخر درجة, on the home screen.
 *
 * The record strip below already links to `/grades` and shows an AVERAGE across
 * subjects. That is not what a student opens the app for the day after an exam;
 * they want the mark, by name, with the تقدير beside it. The average is a
 * summary of the term, this is the news.
 *
 * It renders NOTHING until something has been marked, rather than an empty
 * card with a dash: a student with no grades yet is being told about a part of
 * the product that has not started, and an em dash says nothing they can act
 * on. `latestGrade` is the same derivation `/grades` uses for its own card, so
 * the two can never name different exams.
 */
export function LatestGradeCard() {
  const t = useTranslations();
  const { formatPercent, formatDate } = useFormatters();
  const { result } = useList({ resource: "grades", pagination: { mode: "off" } });

  const latest = latestGrade((result?.data ?? []) as GradeRow[]);
  if (!latest) return null;

  const { entry, label } = latest;

  return (
    <Link
      href="/dashboard/student/grades"
      aria-label={t("studentDashboard.openRecord", {
        record: t("studentClass.latestGrade"),
      })}
      className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--indigo)]"
    >
      <Sheet className="p-5 transition-colors group-hover:border-[var(--indigo)]">
        <div className="flex items-start justify-between gap-2">
          <Eyebrow>{t("studentClass.latestGrade")}</Eyebrow>
          <DirectionalIcon
            icon={ChevronRight}
            aria-hidden
            className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
            style={{ color: "var(--ink-3)" }}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {/* The raw mark leads: an exam comes back as "٤٢ من ٥٠", and that is
              the figure the student is holding. The percentage supports it. */}
          <Num className="text-[28px] font-semibold" style={{ color: "var(--ink)" }}>
            {entry.score}/{entry.maxScore}
          </Num>
          <Num className="text-sm" style={{ color: "var(--ink-2)" }}>
            {formatPercent(entry.percent)}
          </Num>
          <Chip tone={CHIP_TONE[entry.band.tone]}>{t(`gradeBands.${entry.band.id}`)}</Chip>
        </div>

        <p className="mt-1 truncate text-sm font-medium" style={{ color: "var(--ink-2)" }}>
          {entry.name || label}
        </p>
        <p className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>
          {entry.name && label ? `${label} · ` : ""}
          {entry.date ? formatDate(entry.date, { day: "numeric", month: "long" }) : ""}
        </p>
      </Sheet>
    </Link>
  );
}
