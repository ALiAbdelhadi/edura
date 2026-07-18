"use client";

import { useList, useCustom } from "@refinedev/core";
import { Star, Trophy, CheckCircle2, BarChart3, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Progress } from "@repo/ui/components/progress";
import { StatCard } from "@/components/kit/stat-card";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { StatusBadge } from "@/components/kit/status-badge";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import {
  useChildSelector,
  ChildSelectorBar,
} from "@/components/ui/child-selector";
import { BarChart } from "@/components/charts";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { PageSkeleton } from "@/components/ui/skeletons";
const CHART_COLORS = [
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
      color: CHART_COLORS[i % CHART_COLORS.length],
    };
  });

  const gpa =
    rows.length > 0
      ? (
          rows.reduce((a, b) => a + letterToGPA(b.grade), 0) / rows.length
        ).toFixed(1)
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
            className="inline-block size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: row.original.color }}
          />
          <span className="font-semibold text-foreground">
            {row.original.subject || row.original.name}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "entries",
      header: t("parentProgress.entries"),
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.entries}</span>
      ),
    },
    {
      id: "overall",
      header: t("parentProgress.overall"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Progress value={row.original.pct} className="h-1.5 w-24" />
          <span className="tabular-nums text-muted-foreground">
            {formatPercent(row.original.pct)}
          </span>
        </div>
      ),
    },
    {
      id: "grade",
      header: t("parentProgress.grade"),
      cell: ({ row }) => (
        <StatusBadge
          tone={
            row.original.pct >= 90
              ? "success"
              : row.original.pct >= 75
                ? "info"
                : "warning"
          }
        >
          {row.original.grade}
        </StatusBadge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("roles.parent")}
        title={t("nav.progress")}
        actions={<ChildSelectorBar />}
      />

      {isLoading && childGrades.length === 0 ? (
        <PageSkeleton />
      ) : !childId ? (
        <EmptyState icon={Users} title={t("parentProgress.noChildren")} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={t("parentProgress.overallGpa")}
              value={String(gpa)}
              icon={Star}
            />
            <StatCard
              label={t("parentProgress.topSubject")}
              value={best ? best.grade : "—"}
              icon={Trophy}
            />
            <StatCard
              label={t("parentProgress.attendanceRate")}
              value={formatPercent(attendanceRate)}
              icon={CheckCircle2}
            />
            <StatCard
              label={t("parentProgress.subjects")}
              value={rows.length}
              icon={BarChart3}
            />
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">
              {t("parentProgress.subjectBreakdown")}
            </h2>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("parentProgress.subjectComparison")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart
                  data={rows.map((row) => ({
                    label: row.subject || row.name,
                    average: row.pct,
                  }))}
                  series={[
                    {
                      key: "average",
                      label: t("parentProgress.averagePercent"),
                      color: "var(--info)",
                    },
                  ]}
                  horizontal
                  yValueFormatter={(value) => formatPercent(value)}
                  emptyText={t("parentProgress.noComparison")}
                />
              </CardContent>
            </Card>
            <DataTable
              columns={columns}
              data={rows}
              pageSize={100}
              emptyState={t("parentProgress.noGrades")}
            />
          </div>
        </>
      )}
    </div>
  );
}
