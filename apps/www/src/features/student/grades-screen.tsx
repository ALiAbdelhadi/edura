"use client";

import { useList } from "@refinedev/core";
import { Star, Trophy, BookOpen, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Progress } from "@repo/ui/components/progress";
import { StatCard } from "@/components/kit/stat-card";
import { PageHeader } from "@/components/kit/page-header";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { StatusBadge } from "@/components/kit/status-badge";
import { PageSpinner } from "@/components/kit/spinner";
import { BarChart } from "@/components/charts";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
// Data-viz palette for the per-subject legend swatches (mirrors the D3 charts).
const CHART_COLORS = ["#0fa5e9", "#8b5cf6", "#177674", "#f97315", "#22c55f", "#ed4899", "#600000"];

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
  if (pct >= 67) return "D+";
  if (pct >= 60) return "D";
  return "F";
}

function letterToGPA(letter: string): number {
  const map: Record<string, number> = { "A+": 4.0, "A": 4.0, "A-": 3.7, "B+": 3.3, "B": 3.0, "B-": 2.7, "C+": 2.3, "C": 2.0, "C-": 1.7, "D+": 1.3, "D": 1.0, "F": 0.0 };
  return map[letter] ?? 0;
}

export function GradesScreen() {
  const t = useTranslations();
  const { formatPercent } = useFormatters();
  const { query, result } = useList({ resource: "grades" });
  const { result: coursesResult } = useList({ resource: "courses", pagination: { pageSize: 100 } });
  const grades = (result?.data ?? []) as any[];
  const courses = (coursesResult?.data ?? []) as any[];

  const courseNameMap = new Map<string, string>();
  for (const c of courses) {
    courseNameMap.set(c._id || c.id, c.title || c.subject || c._id || c.id);
  }

  const courseMap = new Map<string, { name: string; subject: string; scores: { score: number; max: number }[] }>();
  for (const g of grades) {
    if (!courseMap.has(g.courseId)) {
      courseMap.set(g.courseId, { name: courseNameMap.get(g.courseId) || g.courseName || g.courseId, subject: g.subject || "", scores: [] });
    }
    const myScore = g.scores?.[0];
    if (myScore) courseMap.get(g.courseId)!.scores.push({ score: myScore.score, max: g.maxScore });
  }

  const rows = Array.from(courseMap.entries()).map(([courseId, data], i) => {
    const totalScore = data.scores.reduce((a, b) => a + b.score, 0);
    const totalMax = data.scores.reduce((a, b) => a + b.max, 0);
    const pct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
    return { courseId, name: data.name, subject: data.subject, pct, grade: percentageToGrade(pct), entries: data.scores.length, color: CHART_COLORS[i % CHART_COLORS.length] };
  });

  const gpa = rows.length > 0 ? (rows.reduce((a, b) => a + letterToGPA(b.grade), 0) / rows.length).toFixed(1) : "—";
  const best = rows.reduce<(typeof rows)[0] | null>((best, r) => (!best || r.pct > best.pct ? r : best), null);

  if (query.isLoading) {
    return <PageSpinner label={t("common.loading")} />;
  }

  const columns: ColumnDef<(typeof rows)[number]>[] = [
    {
      id: "subject",
      header: t("studentClass.subject"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span
            className="inline-block size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: row.original.color }}
          />
          <span className="font-semibold text-foreground">{row.original.subject || row.original.name}</span>
        </div>
      ),
    },
    {
      accessorKey: "entries",
      header: t("studentClass.entries"),
      cell: ({ row }) => <span className="tabular-nums">{row.original.entries}</span>,
    },
    {
      id: "score",
      header: t("studentClass.score"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Progress value={row.original.pct} className="h-1.5 w-24" />
          <span className="tabular-nums text-muted-foreground">{formatPercent(row.original.pct)}</span>
        </div>
      ),
    },
    {
      id: "grade",
      header: t("studentClass.grade"),
      cell: ({ row }) => (
        <StatusBadge tone={row.original.pct >= 90 ? "success" : row.original.pct >= 75 ? "info" : "warning"}>
          {row.original.grade}
        </StatusBadge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.grades")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("studentClass.overallGpa")} value={String(gpa)} icon={Star} accent />
        <StatCard label={t("studentClass.highestGrade")} value={best?.grade || "—"} icon={Trophy} />
        <StatCard label={t("studentClass.subjects")} value={courseMap.size} icon={BookOpen} />
        <StatCard label={t("studentClass.entries")} value={grades.length} icon={BarChart3} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("studentClass.gradesTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("studentClass.subjectComparison")}</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart
                data={rows.map((row) => ({ label: row.subject || row.name, pct: row.pct }))}
                series={[{ key: "pct", label: t("studentClass.averagePercent"), color: "var(--info)" }]}
                horizontal
                yValueFormatter={(value) => formatPercent(Math.round(value))}
                emptyText={t("studentClass.noSubjectTrend")}
              />
            </CardContent>
          </Card>
          <DataTable
            columns={columns}
            data={rows}
            pageSize={100}
            emptyState={t("studentClass.noGrades")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
