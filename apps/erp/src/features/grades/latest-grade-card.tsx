"use client";

import { Chip, Eyebrow, Num, Sheet } from "@/components/ledger";
import { latestGrade, type GradeRow } from "@/features/grades/grade-record";
import { Link } from "@/i18n/navigation";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useList } from "@refinedev/core";
import { DirectionalIcon } from "@repo/ui/components/directional-icon";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { QUERY_FRESHNESS } from "@/lib/refine";

const CHIP_TONE = {
  success: "teal",
  info: "indigo",
  neutral: "neutral",
  warning: "amber",
  danger: "red",
} as const;

export function LatestGradeCard({
  href,
  label,
  openLabel,
  studentId,
}: {
  href: string;
  label: string;
  openLabel: string;
  studentId?: string;
}) {
  const { formatPercent, formatDate } = useFormatters();
  const t = useTranslations();
  const { result } = useList({
    resource: "grades",
    pagination: { mode: "off" },
    ...(studentId
      ? {
          filters: [
            { field: "studentId", operator: "eq" as const, value: studentId },
          ],
        }
      : {}),
    queryOptions: QUERY_FRESHNESS.list,
  });

  const latest = latestGrade((result?.data ?? []) as GradeRow[]);
  if (!latest) return null;

  const { entry, label: subject } = latest;

  return (
    <Link
      href={href}
      aria-label={openLabel}
      className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--indigo)"
    >
      <Sheet className="p-5 transition-colors group-hover:border-(--indigo)">
        <div className="flex items-start justify-between gap-2">
          <Eyebrow>{label}</Eyebrow>
          <DirectionalIcon
            icon={ChevronRight}
            aria-hidden
            className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
            style={{ color: "var(--ink-3)" }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Num className="text-[28px] font-semibold" style={{ color: "var(--ink)" }}>
            {entry.score}/{entry.maxScore}
          </Num>
          <Num className="text-sm" style={{ color: "var(--ink-2)" }}>
            {formatPercent(entry.percent)}
          </Num>
          <Chip tone={CHIP_TONE[entry.band.tone]}>{t(`gradeBands.${entry.band.id}`)}</Chip>
        </div>
        <p className="mt-1 truncate text-sm font-medium" style={{ color: "var(--ink-2)" }}>
          {entry.name || subject}
        </p>
        <p className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>
          {entry.name && subject ? `${subject} · ` : ""}
          {entry.date ? formatDate(entry.date, { day: "numeric", month: "long" }) : ""}
        </p>
      </Sheet>
    </Link>
  );
}
