"use client";

import { useList } from "@refinedev/core";
import { Users } from "lucide-react";
import { Progress } from "@repo/ui/components/progress";
import { QuerySection } from "@repo/ui/components/query-section";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { useChildSelector } from "@/components/ui/child-selector";
import { BarChart } from "@/components/charts";
import { useTranslations } from "next-intl";
import { bandForPercent, percentOf } from "@repo/shared/grading-scale";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { Figure, Metric, SectionHead, SkeletonRows } from "@repo/ui/components/ledger";
import { QUERY_FRESHNESS } from "@/lib/refine";

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
  const {
    childId,
    childName,
    isLoading: childrenLoading,
    failed: childrenFailed,
  } = useChildSelector();

  const { query: gradesQuery, result: gradesResult } = useList({
    resource: "grades",
    filters: childId
      ? [{ field: "studentId", operator: "eq", value: childId }]
      : undefined,
    queryOptions: { ...QUERY_FRESHNESS.list, enabled: !!childId },
  });


  const childGrades = (gradesResult?.data ?? []) as any[];

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
        <span className="block text-end text-[13px] font-semibold text-ink">
          {t(`gradeBands.${row.original.band.id}`)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={t("roles.parent")}
        title={
          childName
            ? t("parentProgress.titleFor", { name: childName })
            : t("nav.progress")
        }
      />

      {childrenLoading ? (
        <SkeletonRows rows={4} />
      ) : childrenFailed ? (
        <EmptyState icon={Users} title={t("parentPay.childrenUnavailable")} />
      ) : !childId ? (
        <EmptyState icon={Users} title={t("parentProgress.noChildren")} />
      ) : (
        <QuerySection query={gradesQuery} skeleton={<SkeletonRows rows={4} />}>
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
        </QuerySection>
      )}
    </div>
  );
}
