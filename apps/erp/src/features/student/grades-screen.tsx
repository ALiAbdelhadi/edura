"use client";

import { useState } from "react";
import { useList } from "@refinedev/core";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@repo/ui/lib/utils";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { PageSpinner } from "@/components/kit/spinner";
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
} from "@/features/student/grades";

/**
 * The band's semantic tone, spelled in this portal's chip vocabulary. The
 * mapping lives here rather than in the scale module because "teal/indigo/
 * amber" are the Ledger's paint names and mean nothing to the domain — but
 * it is ONE mapping, so the thresholds cannot drift from the ladder again
 * (they had: this chip used to switch at 85/60, which matched none of the
 * bands it sat next to).
 */
const CHIP_TONE = {
  success: "teal",
  info: "indigo",
  neutral: "neutral",
  warning: "amber",
  danger: "red",
} as const;

/**
 * درجاتي — the record, with the entries behind each figure.
 *
 * THE SCALE IS `@repo/database/grading-scale`. This screen used to carry its
 * own copy of a US A–F ladder, duplicated from the dashboard route and the
 * parent screen — three copies that had already drifted. Egyptian K-12 reports
 * a percentage and a تقدير, so that is what the one shared table returns, and
 * the percentage keeps the weight: it is the figure the entries actually
 * support. There is no GPA, and there is no letter.
 *
 * ── WHAT CHANGED IN THE IA PASS, AND WHY ──────────────────────────────────
 *
 * 1. THE INDIVIDUAL EXAM IS NOW REACHABLE. The page showed per-subject totals
 *    and nothing else, so the question it exists to answer — "جبت كام في
 *    امتحان الكيميا؟" — had no answer anywhere in the product. Every field
 *    needed was already in the `grades` payload; a subject now expands to the
 *    entries that produced its figure.
 * 2. THE THREE COUNTER CARDS WENT DOWN TO TWO. "المواد" counted the rows
 *    printed directly beneath it — the page counting itself. "الدرجات
 *    المرصودة" is lineage, and lineage belongs against the figure it supports,
 *    so it moved into each row. What replaced them is آخر درجة, which is the
 *    thing a student opens this page for.
 * 3. THE SECOND REQUEST WENT. The screen fetched `courses` (pageSize 100) to
 *    build a name map, but `GET /grades` already enriches every row with
 *    `courseName` and `subject` for exactly this reader.
 *
 * ── ROWS, NOT A TABLE ─────────────────────────────────────────────────────
 *
 * Four columns of figures at 375px is either a sideways scroll or four
 * unreadable ones. Each subject is a row that stacks, and the entries live
 * inside it.
 */
export function GradesScreen() {
  const t = useTranslations();
  const { formatPercent, formatDate } = useFormatters();
  const { query, result } = useList({ resource: "grades", pagination: { mode: "off" } });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = (result?.data ?? []) as GradeRow[];
  const subjects = gradesBySubject(rows);
  const latest = latestGrade(rows);
  const best = bestSubject(subjects);
  const entries = countEntries(subjects);

  if (query.isLoading) return <PageSpinner label={t("common.loading")} />;

  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id));

  return (
    <div className="space-y-6">
      <PageTitle title={t("nav.grades")} subtitle={t("studentClass.gradesSubtitle")} />

      {/* ── The two figures worth a card ────────────────────────────────────
          آخر درجة first: a student comes to this page after a specific exam,
          not to contemplate an average. */}
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

        {/* The best subject is a footnote next to the newest mark, so on a
            phone it is ONE line — label, figure, subject — instead of a second
            290px card. From `sm` it becomes the card beside its neighbour and
            the figure gets its full size. */}
        <Sheet className="flex items-baseline justify-between gap-3 p-4 sm:block sm:p-5">
          <Eyebrow>{t("studentClass.highestGrade")}</Eyebrow>
          <div className="flex items-baseline gap-2 sm:mt-1 sm:block">
            {/* Was a literal `${pct}%` directly above a table whose every row
                formats through `formatPercent`, so in Arabic this card said
                `92%` while the rows beneath it said `85٪`. */}
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
        /* The visible label is composed of nested spans beside a decorative
           tile, so the control is named explicitly — otherwise the
           accessibility tree reports a row of unnamed expanders. */
        aria-label={subject.label}
        className="flex w-full items-center gap-3 py-3.5 text-start transition-colors hover:bg-[var(--field)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--indigo)]"
      >
        <InitialsTile name={subject.label || "?"} size={32} tone="teal" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium" style={{ color: "var(--ink)" }}>
            {subject.label}
          </span>
          {/* The entry count IS the lineage for the percentage beside it — a
              score with no entry count behind it is a figure the student has to
              take on trust. */}
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
          {/* Vertical rotation only — a chevron that points DOWN does not lie
              in RTL, so this one is not a directional icon. */}
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
                {/* The raw mark leads here, not the percentage: an exam is
                    handed back as "٤٢ من ٥٠", and that is the figure the
                    student is holding on paper. */}
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
