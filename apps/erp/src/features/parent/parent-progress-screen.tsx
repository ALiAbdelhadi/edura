"use client";

// Child progress — read-only.
//
// A parent reads this record; they do not write it. Nothing here is editable
// and nothing pretends to be.
//
// Grades are rendered as plain mono ink, NOT as coloured status badges. In this
// system colour carries a fixed meaning — teal money confirmed, amber waiting,
// red irreversible — and a child's تقدير is none of those. Tinting it would
// spend a semantic on decoration, and would quietly editorialise about the
// child on their parent's screen. The percentage bar carries the at-a-glance
// signal, which is why `GradeBand.tone` is deliberately not read here.
//
// THE SCALE IS `@repo/database/grading-scale`, NOT A COPY. This screen used to
// hold its own A–F ladder plus a 4.0 GPA; the ladder had already drifted from
// the two other copies (it floored at "D", so a child at 12% and one at 61%
// read the same), and the GPA averaged letters that were themselves derived
// from percentages — two lossy conversions to reach a number that means
// nothing to an Egyptian family. Percentage + تقدير now, from the one table.
import { useList } from "@refinedev/core";
import { Users } from "lucide-react";
import { Progress } from "@repo/ui/components/progress";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { useChildSelector } from "@/components/ui/child-selector";
import { BarChart } from "@/components/charts";
import { useTranslations } from "next-intl";
import { bandForPercent, percentOf } from "@repo/database/grading-scale";
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

export function ParentProgressScreen() {
  const t = useTranslations();
  const { formatPercent } = useFormatters();
  const { childId, childName, isLoading: childrenLoading } = useChildSelector();

  const { query: gradesQuery, result: gradesResult } = useList({
    resource: "grades",
    filters: childId
      ? [{ field: "studentId", operator: "eq", value: childId }]
      : undefined,
    queryOptions: { enabled: !!childId },
  });


  const childGrades = (gradesResult?.data ?? []) as any[];
  const isLoading =
    childrenLoading || gradesQuery.isLoading;

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
    const pct = percentOf(totalScore, totalMax);
    return {
      courseId,
      name: data.name,
      subject: data.subject,
      pct,
      band: bandForPercent(pct),
      entries: data.scores.length,
      color: SERIES[i % SERIES.length],
    };
  });

  // Each subject row is المجموع ÷ المجموع الكلي (see `percentOf` above), so a
  // 50-mark final already outweighs a 10-mark quiz WITHIN a subject. The
  // headline then averages the SUBJECT percentages rather than pooling every
  // mark in the child's record — otherwise a subject that happens to run more
  // assessments would quietly dominate the figure a parent reads as "how is my
  // child doing". Same rule in the student dashboard route, so the two agree.
  const overallPct =
    rows.length > 0
      ? Math.round(rows.reduce((a, b) => a + b.pct, 0) / rows.length)
      : 0;
  const overallBand = bandForPercent(overallPct);
  const best = rows.reduce<(typeof rows)[0] | null>(
    (best, r) => (!best || r.pct > best.pct ? r : best),
    null,
  );

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
        // Not a <Figure>: التقدير is a word, and Figure is the mono numeral
        // face this design system reserves for figures.
        <span className="block text-end text-[13px] font-semibold text-ink">
          {t(`gradeBands.${row.original.band.id}`)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* The title names the child. A page of percentages headed "التقدم"
          is a record about nobody — and for a single-child parent the old chip
          bar rendered nothing at all, so the name appeared on no screen in the
          portal. The child context bar above states it too; this states it in
          the sentence a screenshot captures. */}
      <PageHeader
        eyebrow={t("roles.parent")}
        title={
          childName
            ? t("parentProgress.titleFor", { name: childName })
            : t("nav.progress")
        }
      />

      {isLoading && childGrades.length === 0 ? (
        <SkeletonRows rows={4} />
      ) : !childId ? (
        <EmptyState icon={Users} title={t("parentProgress.noChildren")} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Metric
              label={t("parentProgress.overallPercent")}
              value={<Figure>{formatPercent(overallPct)}</Figure>}
              reason={
                rows.length > 0
                  ? t("parentProgress.overallReason", {
                      band: t(`gradeBands.${overallBand.id}`),
                      count: rows.length,
                    })
                  : t("parentProgress.noGradesYet")
              }
            />
            <Metric
              label={t("parentProgress.topSubject")}
              value={<Figure>{best ? formatPercent(best.pct) : "—"}</Figure>}
              reason={best ? best.subject || best.name : undefined}
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
