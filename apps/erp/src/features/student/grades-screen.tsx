"use client";

import { useState } from "react";
import { useList } from "@refinedev/core";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@repo/ui/lib/utils";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { PageSpinner } from "@/components/kit/spinner";
import { QuerySection } from "@repo/ui/components/query-section";
import {
  Chip,
  Eyebrow,
  Hairline,
  InitialsTile,
  LedgerEmpty,
  Num,
  PageTitle,
  SectionHeading,
  Sheet,
} from "@/features/student/ledger";
import {
  bestSubject,
  countEntries,
  gradesBySubject,
  latestGrade,
  type GradeRow,
  type SubjectGrades,
} from "@/features/grades/grade-record";
import { QUERY_FRESHNESS } from "@/lib/refine";

const CHIP_TONE = {
  success: "teal",
  info: "indigo",
  neutral: "neutral",
  warning: "amber",
  danger: "red",
} as const;

export function GradesScreen() {
  const t = useTranslations();
  const { formatPercent, formatDate } = useFormatters();
  const { query, result } = useList({ resource: "grades", pagination: { mode: "off" }, queryOptions: QUERY_FRESHNESS.list });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = (result?.data ?? []) as GradeRow[];
  const subjects = gradesBySubject(rows);
  const latest = latestGrade(rows);
  const best = bestSubject(subjects);
  const entries = countEntries(subjects);

  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id));

  return (
    <div className="space-y-6">
      <PageTitle title={t("nav.grades")} subtitle={t("studentClass.gradesSubtitle")} />

      <QuerySection
        query={query}
        skeleton={<PageSpinner label={t("common.loading")} />}
      >
      <div className="grid gap-3 sm:grid-cols-2">
        <Sheet className="p-5" data-tour="student-latest-grade">
          <Eyebrow>{t("studentClass.latestGrade")}</Eyebrow>
          {latest ? (
            <>
              <div className="mt-1 flex items-baseline gap-2">
                <Num className="text-[30px] font-semibold" style={{ color: "var(--ink)" }}>
                  {formatPercent(latest.entry.percent)}
                </Num>
                <Chip tone={CHIP_TONE[latest.entry.band.tone]}>
                  {t(`gradeBands.${latest.entry.band.id}`)}
                </Chip>
              </div>
              <p className="mt-1 truncate text-sm font-medium" style={{ color: "var(--ink-2)" }}>
                {latest.entry.name || latest.label}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>
                {latest.entry.name ? `${latest.label} · ` : ""}
                {latest.entry.date
                  ? formatDate(latest.entry.date, { day: "numeric", month: "long" })
                  : t("studentClass.tbd")}
              </p>
            </>
          ) : (
            <Num className="text-[30px] font-semibold" style={{ color: "var(--ink-3)" }}>
              —
            </Num>
          )}
        </Sheet>

        <Sheet className="flex items-baseline justify-between gap-3 p-4 sm:block sm:p-5">
          <Eyebrow>{t("studentClass.highestGrade")}</Eyebrow>
          <div className="flex items-baseline gap-2 sm:mt-1 sm:block">
            <Num
              className="text-[19px] font-semibold sm:text-[30px]"
              style={{ color: "var(--ink)" }}
            >
              {best ? formatPercent(best.percent) : "—"}
            </Num>
            {best ? (
              <p className="truncate text-xs sm:mt-1" style={{ color: "var(--ink-3)" }}>
                {best.label}
              </p>
            ) : null}
          </div>
        </Sheet>
      </div>

      <Sheet className="p-5">
        <SectionHeading
          title={t("studentClass.gradesTitle")}
          action={
            entries > 0 ? (
              <span className="text-xs" style={{ color: "var(--ink-3)" }}>
                {t("studentClass.entriesCount", { count: entries })}
              </span>
            ) : null
          }
        />
        <div className="mt-3">
          {subjects.length === 0 ? (
            <LedgerEmpty title={t("studentClass.noGrades")} />
          ) : (
            <ul>
              {subjects.map((subject, i) => (
                <li key={subject.courseId}>
                  {i > 0 ? <Hairline /> : null}
                  <SubjectRow
                    subject={subject}
                    expanded={expandedId === subject.courseId}
                    onToggle={() => toggle(subject.courseId)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>
      </QuerySection>
    </div>
  );
}

function SubjectRow({
  subject,
  expanded,
  onToggle,
}: {
  subject: SubjectGrades;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations();
  const { formatPercent, formatDate } = useFormatters();

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={subject.label}
        className="flex w-full items-center gap-3 py-3.5 text-start transition-colors hover:bg-[var(--field)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--indigo)]"
      >
        <InitialsTile name={subject.label || "?"} size={32} tone="teal" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium" style={{ color: "var(--ink)" }}>
            {subject.label}
          </span>
          <span className="block text-xs" style={{ color: "var(--ink-3)" }}>
            {t("studentClass.entriesCount", { count: subject.entries.length })}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-end">
            <Num className="block font-semibold" style={{ color: "var(--ink)" }}>
              {formatPercent(subject.percent)}
            </Num>
            <Num className="block text-[11px]" style={{ color: "var(--ink-3)" }}>
              {subject.totalScore}/{subject.totalMax}
            </Num>
          </span>
          <Chip tone={CHIP_TONE[subject.band.tone]}>{t(`gradeBands.${subject.band.id}`)}</Chip>
          <ChevronDown
            aria-hidden
            className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-180")}
            style={{ color: "var(--ink-3)" }}
          />
        </span>
      </button>

      {expanded ? (
        <ul className="pb-3 ps-11">
          {subject.entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 border-t py-2.5"
              style={{ borderColor: "var(--rule-2)" }}
            >
              <div className="min-w-0">
                <p className="truncate text-sm" style={{ color: "var(--ink)" }}>
                  {entry.name || t("studentClass.entry")}
                </p>
                <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                  {entry.date
                    ? formatDate(entry.date, { day: "numeric", month: "long" })
                    : t("studentClass.tbd")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Num className="font-semibold" style={{ color: "var(--ink)" }}>
                  {entry.score}/{entry.maxScore}
                </Num>
                <Num className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                  {formatPercent(entry.percent)}
                </Num>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
