"use client";

import React, { useState } from "react";
import { useList } from "@refinedev/core";
import { FileText, Trophy, CheckCircle2, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { StatCard } from "@/components/kit/stat-card";
import { PageHeader } from "@/components/kit/page-header";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { StatusBadge } from "@/components/kit/status-badge";
import { PageSpinner } from "@/components/kit/spinner";
import { BarChart } from "@/components/charts";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";

type Assignment = {
  id: string;
  title: string;
  subject: string;
  status: "graded" | "pending";
  score?: string;
  date: string;
};

export function AssignmentsScreen() {
  const t = useTranslations();
  const { formatDate, formatPercent } = useFormatters();
  const { query, result } = useList({ resource: "grades" });
  const [filter, setFilter] = useState<"all" | "pending" | "graded">("all");

  const grades = (result?.data ?? []) as any[];

  const assignments: Assignment[] = grades.map((g: any) => {
    const myScore = g.scores?.[0];
    const status = myScore ? "graded" : "pending";
    return {
      id: g.id || g._id,
      title: g.name,
      subject: g.courseId,
      status,
      score: myScore ? `${myScore.score}/${g.maxScore}` : undefined,
      date: formatDate(g.date, { month: "short", day: "numeric" }),
    };
  });

  const filtered = filter === "all" ? assignments : assignments.filter((a) => a.status === filter);
  const pending = assignments.filter((a) => a.status === "pending").length;
  const graded = assignments.filter((a) => a.status === "graded").length;
  const completion = assignments.length > 0 ? Math.round((graded / assignments.length) * 100) : 0;

  const weeklyTrend = React.useMemo(() => {
    const map = new Map<string, { label: string; pending: number; graded: number }>();
    for (const assignment of assignments) {
      const source = grades.find((g: any) => (g.id || g._id) === assignment.id);
      if (!source?.date) continue;
      const date = new Date(source.date);
      const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-W${Math.ceil(date.getUTCDate() / 7)}`;
      const label = `${formatDate(date, { month: "short" })} ${t("studentClass.weekShort")}${Math.ceil(date.getUTCDate() / 7)}`;
      const bucket = map.get(period) ?? { label, pending: 0, graded: 0 };
      if (assignment.status === "graded") bucket.graded += 1;
      else bucket.pending += 1;
      map.set(period, bucket);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value)
      .slice(-8);
  }, [assignments, grades, formatDate, t]);

  const columns: ColumnDef<Assignment>[] = [
    { accessorKey: "title", header: t("studentClass.assignment") },
    { accessorKey: "subject", header: t("studentClass.subject") },
    { accessorKey: "date", header: t("studentClass.date") },
    {
      accessorKey: "score",
      header: t("studentClass.score"),
      cell: ({ row }) => row.original.score || "—",
    },
    {
      id: "status",
      header: t("studentClass.statusLabel"),
      cell: ({ row }) => (
        <StatusBadge tone={row.original.status === "graded" ? "success" : "warning"}>
          {row.original.status === "graded" ? t("studentClass.graded") : t("status.pending")}
        </StatusBadge>
      ),
    },
  ];

  if (query.isLoading) {
    return <PageSpinner label={t("common.loading")} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.assignments")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("status.pending")} value={pending} icon={FileText} />
        <StatCard label={t("studentClass.graded")} value={graded} icon={Trophy} />
        <StatCard label={t("studentClass.totalEntries")} value={assignments.length} icon={CheckCircle2} />
        <StatCard label={t("studentClass.completion")} value={formatPercent(completion)} icon={BarChart3} accent />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>{t("nav.assignments")}</CardTitle>
          <div className="flex items-center gap-2">
            {(["all", "pending", "graded"] as const).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(f)}
              >
                {f === "all" ? t("studentClass.filterAll") : f === "pending" ? t("status.pending") : t("studentClass.graded")}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm">{t("studentClass.dueVsCompleted")}</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart
                data={weeklyTrend}
                series={[
                  { key: "pending", label: t("status.pending"), color: "var(--warning)" },
                  { key: "graded", label: t("status.completed"), color: "var(--success)" },
                ]}
                stacked
                emptyText={t("studentClass.noWeeklyTrend")}
              />
            </CardContent>
          </Card>
          <DataTable
            columns={columns}
            data={filtered}
            pageSize={10}
            emptyState={t("studentClass.noAssignments")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
