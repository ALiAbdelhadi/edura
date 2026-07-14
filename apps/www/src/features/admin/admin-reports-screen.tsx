"use client";

import React from "react";
import { useCustom } from "@refinedev/core";
import dayjs, { type Dayjs } from "dayjs";
import { DollarSign, FileText, BarChart3, CheckCircle2, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Button } from "@repo/ui/components/button";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { StatCard } from "@/components/kit/stat-card";
import { PageSpinner } from "@/components/kit/spinner";
import { EmptyState } from "@/components/kit/empty-state";
import { BarChart, DonutChart } from "@/components/charts";
import {
  enrollmentFunnelBarData,
  sessionStatusDonutData,
} from "@/lib/analytics/transforms";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--brand-teal)",
  "var(--primary)",
];

export function AdminReportsScreen() {
  const t = useTranslations();
  const { formatShortEGP } = useFormatters();
  const fmtEGP = formatShortEGP;
  const [range, setRange] = React.useState<[Dayjs, Dayjs] | null>(null);
  const [startDraft, setStartDraft] = React.useState("");
  const [endDraft, setEndDraft] = React.useState("");
  const [granularity, setGranularity] = React.useState<"week" | "month">("month");

  const applyRange = (start: string, end: string) => {
    setStartDraft(start);
    setEndDraft(end);
    if (start && end) setRange([dayjs(start), dayjs(end)]);
    else setRange(null);
  };

  const resetRange = () => {
    setStartDraft("");
    setEndDraft("");
    setRange(null);
  };

  const queryValues = React.useMemo(
    () => ({
      ...(range?.[0] ? { from: range[0].format("YYYY-MM-DD") } : {}),
      ...(range?.[1] ? { to: range[1].format("YYYY-MM-DD") } : {}),
      granularity,
    }),
    [range, granularity],
  );

  const { query, result } = useCustom({
    url: "reports/net-profit",
    method: "get",
    config: { query: queryValues },
  });
  const { query: trendQuery, result: trendResult } = useCustom({
    url: "reports/revenue-timeseries",
    method: "get",
    config: { query: queryValues },
  });
  const { query: expensesQuery, result: expensesTimeseriesResult } = useCustom({
    url: "reports/expenses-timeseries",
    method: "get",
    config: { query: queryValues },
  });
  const { result: fillRateResult } = useCustom({
    url: "reports/course-fill-rates",
    method: "get",
    config: { query: queryValues },
  });
  const { result: funnelResult } = useCustom({ url: "reports/enrollment-funnel", method: "get", config: { query: queryValues } });
  const data = (result?.data as any) || null;
  const trendData = ((trendResult?.data as any)?.series ?? []) as any[];
  const expensesByCategory = ((expensesTimeseriesResult?.data as any)?.byCategory ?? []) as any[];
  const fillRates = ((fillRateResult?.data as any)?.items ?? []) as any[];
  const funnel = ((funnelResult?.data as any)?.items ?? []) as any[];

  if ((query.isLoading || trendQuery.isLoading || expensesQuery.isLoading) && !result?.data) {
    return <PageSpinner label={t("adminManage.reports.loadingReports")} />;
  }

  if (query.isError && !data) {
    return (
      <EmptyState icon={TriangleAlert} title={t("adminManage.reports.loadFailed")} />
    );
  }

  const revenue = data?.revenue ?? 0;
  const expenses = data?.expenses ?? 0;
  const netProfit = data?.netProfit ?? 0;
  const margin = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : "0";
  const byCourse = data?.byCourse ?? [];
  const enrollmentRates = fillRates.length > 0 ? fillRates : data?.enrollmentRates ?? [];
  const sessionStatusMix = data?.sessionStatusMix ?? [];

  const expenseDonut = expensesByCategory.map((entry, index) => ({
    id: entry._id,
    label: entry._id,
    value: entry.subtotal ?? 0,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{t("adminManage.reports.dateRange")}</span>
            <Input
              type="date"
              className="w-40"
              value={startDraft}
              onChange={(event) => applyRange(event.target.value, endDraft)}
            />
            <Input
              type="date"
              className="w-40"
              value={endDraft}
              onChange={(event) => applyRange(startDraft, event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{t("adminManage.reports.granularity")}</span>
            <ToggleGroup
              type="single"
              variant="outline"
              value={granularity}
              onValueChange={(value) => value && setGranularity(value as "week" | "month")}
            >
              <ToggleGroupItem value="month">{t("adminManage.reports.monthly")}</ToggleGroupItem>
              <ToggleGroupItem value="week">{t("adminManage.reports.weekly")}</ToggleGroupItem>
            </ToggleGroup>
            <Button variant="outline" onClick={resetRange}>{t("adminManage.reports.reset")}</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("common.revenue")} value={fmtEGP(revenue)} icon={DollarSign} />
        <StatCard label={t("common.expenses")} value={fmtEGP(expenses)} icon={FileText} />
        <StatCard
          label={t("adminManage.reports.netProfit")}
          value={fmtEGP(netProfit)}
          hint={`${margin}% ${t("adminManage.reports.margin")}`}
          icon={BarChart3}
          accent
        />
        <StatCard
          label={t("adminManage.reports.attendanceRate")}
          value={`${data?.attendanceRate ?? 0}%`}
          icon={CheckCircle2}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{`${t("adminManage.reports.cashflow")} (${granularity === "month" ? t("adminManage.reports.monthly") : t("adminManage.reports.weekly")})`}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={trendData.map((entry) => ({
                label: entry.label,
                revenue: entry.revenue,
                expenses: entry.expenses,
              }))}
              series={[
                { key: "revenue", label: t("common.revenue"), color: "var(--info)" },
                { key: "expenses", label: t("common.expenses"), color: "var(--warning)" },
              ]}
              yValueFormatter={(value) => fmtEGP(value)}
              emptyText={t("adminManage.reports.noCashflow")}
            />
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{t("adminManage.reports.expenseCategories")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart data={expenseDonut} centerLabel={t("common.expenses")} emptyText={t("adminManage.reports.noExpenseBreakdown")} formatValue={fmtEGP} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("adminManage.reports.revenueByCourse")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={byCourse.slice(0, 8).map((entry: any) => ({
                label: entry.title,
                revenue: entry.revenue,
              }))}
              series={[{ key: "revenue", label: t("common.revenue"), color: "var(--info)" }]}
              horizontal
              yValueFormatter={(value) => fmtEGP(value)}
              emptyText={t("adminManage.reports.noRevenueByCourse")}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("adminManage.reports.enrollmentRate")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={enrollmentRates.slice(0, 8).map((entry: any) => ({
                label: entry.title,
                fillRate: entry.fillRatePct ?? entry.pct,
              }))}
              series={[{ key: "fillRate", label: t("adminManage.reports.fillRatePct"), color: "var(--success)" }]}
              horizontal
              yValueFormatter={(value) => `${Math.round(value)}%`}
              emptyText={t("adminManage.reports.noEnrollmentRate")}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("adminManage.reports.enrollmentFunnel")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={enrollmentFunnelBarData(funnel)}
              series={[{ key: "count", label: t("adminManage.reports.requests"), color: "var(--primary)" }]}
              emptyText={t("adminManage.reports.noEnrollmentRequests")}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("adminManage.reports.sessionStatus")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart data={sessionStatusDonutData(sessionStatusMix)} centerLabel={t("adminManage.reports.sessions")} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
