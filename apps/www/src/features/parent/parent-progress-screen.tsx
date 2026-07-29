"use client";

// Child progress — read-only.
//
// A parent reads this record; they do not write it. Nothing here is editable
// and nothing pretends to be.
//
// Grades are rendered as plain mono ink, NOT as coloured status badges. In this
// system colour carries a fixed meaning — teal money confirmed, amber waiting,
// red irreversible — and a child's B− is none of those. Tinting it would spend
// a semantic on decoration, and would quietly editorialise about the child on
// their parent's screen. The percentage bar carries the at-a-glance signal.
import { useList, useCustom } from "@refinedev/core";
import { Users } from "lucide-react";
import { Progress } from "@repo/ui/components/progress";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import {
  useChildSelector,
  ChildSelectorBar,
} from "@/components/ui/child-selector";
import { BarChart } from "@/components/charts";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { Figure, Metric, SectionHead, SkeletonRows } from "./ledger-kit";

// Chart series read `--chart-*`, NOT `--series-*`.
// Both names existed while the design system was being assembled; the token
// layer that landed on main defines `--chart-1..5` only. A `var()` that
// resolves to nothing makes SVG `fill` fall back to BLACK, so the bars were
// drawn at the right geometry and were simply invisible — the failure is
// silent, which is why it survived a build, a typecheck and a screenshot.
const SERIES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function percentageToGrade(pct: number): string {
  if (pct >= 97) return "A+";
  if (pct >= 93) return "A";
  if (pct >= 90) return "A-";
  if (pct >= 87) return "B+";
  if (pct >= 83) return "B";
  if (pct >= 80) return "B-";
  if (pct >= 77) return "C+";
  if (pct >= 73) return "C";
  if (pct >= 70) return "C-";
  return "D";
}

function letterToGPA(letter: string): number {
  const map: Record<string, number> = {
    "A+": 4.0,
    A: 4.0,
    "A-": 3.7,
    "B+": 3.3,
    B: 3.0,
    "B-": 2.7,
    "C+": 2.3,
    C: 2.0,
    "C-": 1.7,
    "D+": 1.3,
    D: 1.0,
    F: 0.0,
  };
  return map[letter] ?? 0;
}

export function ParentProgressScreen() {
  const t = useTranslations();
  const { formatPercent } = useFormatters();
  const { childId, isLoading: childrenLoading } = useChildSelector();

  const { query: gradesQuery, result: gradesResult } = useList({
    resource: "grades",
    filters: childId
      ? [{ field: "studentId", operator: "eq", value: childId }]
      : undefined,
    queryOptions: { enabled: !!childId },
  });

  const { query: attendanceQuery, result: attendanceResult } = useCustom({
    url: "me/attendance",
    method: "get",
    config: { query: childId ? { studentId: childId } : undefined },
    queryOptions: { enabled: !!childId },
  });

  const childGrades = (gradesResult?.data ?? []) as any[];
  const childAttendance = (attendanceResult?.data as any) || null;
  const isLoading =
    childrenLoading || gradesQuery.isLoading || attendanceQuery.isLoading;

  const courseMap = new Map<
    string,
    {
      name: string;
      subject: string;
      scores: { score: number; max: number }[];
      gradeNames: string[];
    }
  >();
  for (const g of childGrades) {
    if (!courseMap.has(g.courseId)) {
      courseMap.set(g.courseId, {
        name: g.courseName || g.courseId,
        subject: g.subject || "",
        scores: [],
        gradeNames: [],
      });
    }
    const data = courseMap.get(g.courseId)!;
    data.gradeNames.push(g.name);
    const myScore = g.scores?.[0];
    if (myScore) data.scores.push({ score: myScore.score, max: g.maxScore });
  }

  const rows = Array.from(courseMap.entries()).map(([courseId, data], i) => {
    const totalScore = data.scores.reduce((a, b) => a + b.score, 0);
    const totalMax = data.scores.reduce((a, b) => a + b.max, 0);
    const pct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
    return {
      courseId,
      name: data.name,
      subject: data.subject,
      pct,
      grade: percentageToGrade(pct),
      entries: data.scores.length,
      color: SERIES[i % SERIES.length],
    };
  });

  const gpa =
    rows.length > 0
      ? (rows.reduce((a, b) => a + letterToGPA(b.grade), 0) / rows.length).toFixed(1)
      : "—";
  const best = rows.reduce<(typeof rows)[0] | null>(
    (best, r) => (!best || r.pct > best.pct ? r : best),
    null,
  );
  const attendanceRate = childAttendance?.rate ?? 0;

  const columns: ColumnDef<(typeof rows)[number]>[] = [
    {
      id: "subject",
      header: t("parentProgress.subject"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block size-2 shrink-0 rounded-sm"
            style={{ backgroundColor: row.original.color }}
          />
          <span className="text-[13px] font-medium text-ink">
            {row.original.subject || row.original.name}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "entries",
      header: () => (
        <span className="block text-end">{t("parentProgress.entries")}</span>
      ),
      cell: ({ row }) => (
        <span className="block text-end">
          <Figure className="text-ink-2">{row.original.entries}</Figure>
        </span>
      ),
    },
    {
      id: "overall",
      header: t("parentProgress.overall"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Progress value={row.original.pct} className="h-1 w-24" />
          <Figure className="text-[12px] text-ink-2">
            {formatPercent(row.original.pct)}
          </Figure>
        </div>
      ),
    },
    {
      id: "grade",
      header: () => (
        <span className="block text-end">{t("parentProgress.grade")}</span>
      ),
      cell: ({ row }) => (
        <span className="block text-end">
          <Figure className="text-[13px] font-semibold text-ink">
            {row.original.grade}
          </Figure>
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={t("roles.parent")}
        title={t("nav.progress")}
        actions={<ChildSelectorBar />}
      />

      {isLoading && childGrades.length === 0 ? (
        <SkeletonRows rows={4} />
      ) : !childId ? (
        <EmptyState icon={Users} title={t("parentProgress.noChildren")} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label={t("parentProgress.overallGpa")}
              value={<Figure>{String(gpa)}</Figure>}
              reason={t("parentProgress.gpaReason", { count: rows.length })}
            />
            <Metric
              label={t("parentProgress.topSubject")}
              value={<Figure>{best ? best.grade : "—"}</Figure>}
              reason={best ? best.subject || best.name : undefined}
            />
            <Metric
              label={t("parentProgress.attendanceRate")}
              value={<Figure>{formatPercent(attendanceRate)}</Figure>}
              reason={t("parentProgress.attendanceReason")}
            />
            <Metric
              label={t("parentProgress.subjects")}
              value={<Figure>{rows.length}</Figure>}
              reason={t("parentProgress.subjectsReason")}
            />
          </div>

          <section className="flex flex-col gap-3">
            <SectionHead
              eyebrow={t("parentProgress.breakdownEyebrow")}
              title={t("parentProgress.subjectBreakdown")}
            />

            <div className="rounded-xl border border-rule bg-sheet p-4">
              <span className="eyebrow">
                {t("parentProgress.subjectComparison")}
              </span>
              <div className="mt-3" dir="ltr">
                <BarChart
                  data={rows.map((row) => ({
                    label: row.subject || row.name,
                    average: row.pct,
                  }))}
                  series={[
                    {
                      key: "average",
                      label: t("parentProgress.averagePercent"),
                      color: "var(--chart-1)",
                    },
                  ]}
                  horizontal
                  yValueFormatter={(value) => formatPercent(value)}
                  emptyText={t("parentProgress.noComparison")}
                />
              </div>
            </div>

            <DataTable
              columns={columns}
              data={rows}
              pageSize={100}
              emptyState={t("parentProgress.noGrades")}
            />
          </section>
        </>
      )}
    </div>
  );
}
