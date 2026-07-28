/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { BarChart, DonutChart } from "@/components/charts";
import { PageSpinner } from "@/components/kit/spinner";
import { enrollmentFunnelBarData, sessionStatusDonutData } from "@/lib/analytics/transforms";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useCustom } from "@refinedev/core";
import { Button } from "@repo/ui/components/button";
import { Calendar } from "@repo/ui/components/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/popover";
import dayjs from "dayjs";
import { Calendar as CalendarIcon, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import React from "react";
import {
  Amount,
  CATEGORICAL,
  CHART,
  ErrorState,
  Eyebrow,
  Num,
  PageHead,
  Sheet,
  SheetHead,
} from "./ledger";

type DateRange = { from: Date | undefined; to?: Date | undefined };

/**
 * التقارير — eight endpoints over a 977-line service with no test coverage.
 *
 * SCOPE: restyle the surface, do NOT restructure the logic. Every query, every
 * field read and every derivation below is unchanged from the version this
 * replaces; what changed is the token layer, the figure treatment and the chart
 * colours.
 *
 * Charts previously reached for seven decorative hues (`--chart-1..5`,
 * `--info`, `--warning`, `--success`) from the superseded palette. They now come
 * from one place — see chart-palette.ts — where the colour encodes meaning:
 * teal is money, grey is what it is measured against, red is money leaving.
 */
export function AdminReportsScreen() {
  const t = useTranslations();
  const { formatShortEGP, formatDate, locale } = useFormatters();
  const fmtEGP = formatShortEGP;
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);
  const [granularity, setGranularity] = React.useState<"week" | "month">("month");

  const resetRange = () => setDateRange(undefined);

  const queryValues = React.useMemo(
    () => ({
      ...(dateRange?.from ? { from: dayjs(dateRange.from).format("YYYY-MM-DD") } : {}),
      ...(dateRange?.to ? { to: dayjs(dateRange.to).format("YYYY-MM-DD") } : {}),
      granularity,
    }),
    [dateRange, granularity],
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
  const { result: funnelResult } = useCustom({
    url: "reports/enrollment-funnel",
    method: "get",
    config: { query: queryValues },
  });
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
      <Sheet>
        <ErrorState
          title={t("adminManage.reports.loadFailed")}
          hint={t("shared.ledger.loadFailedHint")}
          onRetry={() => query.refetch()}
          retryLabel={t("actions.retry")}
        />
      </Sheet>
    );
  }

  const revenue = data?.revenue ?? 0;
  const expenses = data?.expenses ?? 0;
  const netProfit = data?.netProfit ?? 0;
  const margin = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : "0";
  const byCourse = data?.byCourse ?? [];
  const enrollmentRates = fillRates.length > 0 ? fillRates : (data?.enrollmentRates ?? []);
  const sessionStatusMix = data?.sessionStatusMix ?? [];

  const expenseDonut = expensesByCategory.map((entry, index) => ({
    id: entry._id,
    label: entry._id,
    value: entry.subtotal ?? 0,
    color: CATEGORICAL[index % CATEGORICAL.length],
  }));

  const rangeLabel = dateRange?.from
    ? dateRange.to
      ? `${formatDate(dateRange.from)} – ${formatDate(dateRange.to)}`
      : formatDate(dateRange.from)
    : t("adminManage.reports.pickDateRange");

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title={t("nav.reports")}
        subtitle={t("adminManage.reports.subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="min-w-56 justify-start gap-2 border-[var(--rule)] bg-[var(--field)] font-normal"
                >
                  <CalendarIcon className="size-4 text-[var(--ink-3)]" />
                  <Num className={dateRange?.from ? "text-[var(--ink)]" : "text-[var(--ink-3)]"}>
                    {rangeLabel}
                  </Num>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  defaultMonth={dateRange?.from}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>

            {/* Status-pill filter row: each pill is its own control, the active
                one carries indigo. Replaces the toggle-group, which read as a
                form widget rather than a filter. */}
            <div className="flex items-center gap-1 rounded-lg border border-[var(--rule)] bg-[var(--field)] p-1">
              {(["month", "week"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGranularity(g)}
                  aria-pressed={granularity === g}
                  className={`h-8 rounded-md px-3 text-[13px] font-semibold transition-colors ${
                    granularity === g
                      ? "bg-[var(--indigo)] text-[var(--indigo-ink)]"
                      : "text-[var(--ink-2)] hover:bg-[var(--rule-2)]"
                  }`}
                >
                  {g === "month"
                    ? t("adminManage.reports.monthly")
                    : t("adminManage.reports.weekly")}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              className="text-[13px] text-[var(--ink-2)]"
              onClick={resetRange}
            >
              {t("adminManage.reports.reset")}
            </Button>
          </div>
        }
      />

      {/* The P&L reads as one statement closing on the accountant's rule, not as
          four disconnected stat cards. Attendance sits apart — it is not money. */}
      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <Sheet>
          <SheetHead title={t("adminManage.reports.netProfit")} />
          <div className="flex flex-col p-[18px]">
            <StatementLine label={t("common.revenue")} piasters={revenue} locale={locale} />
            <StatementLine
              label={t("common.expenses")}
              piasters={-expenses}
              locale={locale}
              tone="out"
            />
            <div className="lg-total mt-1 flex items-baseline justify-between gap-3 pt-3">
              <span className="text-[13px] font-semibold text-[var(--ink)]">
                {t("adminManage.reports.netProfit")}
              </span>
              <span className="flex items-baseline gap-2">
                <Num className="text-[11px] text-[var(--ink-3)]">
                  {margin}% {t("adminManage.reports.margin")}
                </Num>
                <Amount
                  piasters={netProfit}
                  locale={locale}
                  className="text-[22px] font-semibold text-[var(--money)]"
                />
              </span>
            </div>
          </div>
        </Sheet>

        <Sheet>
          <SheetHead title={t("adminManage.reports.attendanceRate")} />
          <div className="p-[18px]">
            <Eyebrow>{t("adminManage.reports.attendanceRate")}</Eyebrow>
            <p className="mt-1 mb-0">
              <Num className="text-[34px] font-semibold leading-none text-[var(--ink)]">
                {data?.attendanceRate ?? 0}%
              </Num>
            </p>
          </div>
        </Sheet>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Sheet className="lg:col-span-2">
          <SheetHead
            title={`${t("adminManage.reports.cashflow")} · ${
              granularity === "month"
                ? t("adminManage.reports.monthly")
                : t("adminManage.reports.weekly")
            }`}
          />
          <div className="p-[18px]">
            <BarChart
              data={trendData.map((entry) => ({
                label: entry.label,
                revenue: entry.revenue,
                expenses: entry.expenses,
              }))}
              series={[
                { key: "revenue", label: t("common.revenue"), color: CHART.money },
                { key: "expenses", label: t("common.expenses"), color: CHART.out },
              ]}
              yValueFormatter={(value) => fmtEGP(value)}
              emptyText={t("adminManage.reports.noCashflow")}
            />
          </div>
        </Sheet>
        <Sheet>
          <SheetHead title={t("adminManage.reports.expenseCategories")} />
          <div className="p-[18px]">
            <DonutChart
              data={expenseDonut}
              centerLabel={t("common.expenses")}
              emptyText={t("adminManage.reports.noExpenseBreakdown")}
              formatValue={fmtEGP}
            />
          </div>
        </Sheet>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Sheet>
          <SheetHead title={t("adminManage.reports.revenueByCourse")} />
          <div className="p-[18px]">
            <BarChart
              data={byCourse.slice(0, 8).map((entry: any) => ({
                label: entry.title,
                revenue: entry.revenue,
              }))}
              series={[{ key: "revenue", label: t("common.revenue"), color: CHART.money }]}
              horizontal
              yValueFormatter={(value) => fmtEGP(value)}
              emptyText={t("adminManage.reports.noRevenueByCourse")}
            />
          </div>
        </Sheet>
        <Sheet>
          <SheetHead title={t("adminManage.reports.enrollmentRate")} />
          <div className="p-[18px]">
            <BarChart
              data={enrollmentRates.slice(0, 8).map((entry: any) => ({
                label: entry.title,
                fillRate: entry.fillRatePct ?? entry.pct,
              }))}
              series={[
                { key: "fillRate", label: t("adminManage.reports.fillRatePct"), color: CHART.count },
              ]}
              horizontal
              yValueFormatter={(value) => `${Math.round(value)}%`}
              emptyText={t("adminManage.reports.noEnrollmentRate")}
            />
          </div>
        </Sheet>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Sheet>
          <SheetHead title={t("adminManage.reports.enrollmentFunnel")} />
          <div className="p-[18px]">
            <BarChart
              data={enrollmentFunnelBarData(funnel)}
              series={[
                { key: "count", label: t("adminManage.reports.requests"), color: CHART.count },
              ]}
              emptyText={t("adminManage.reports.noEnrollmentRequests")}
            />
          </div>
        </Sheet>
        <Sheet>
          <SheetHead title={t("adminManage.reports.sessionStatus")} />
          <div className="p-[18px]">
            <DonutChart
              data={sessionStatusDonutData(sessionStatusMix)}
              centerLabel={t("adminManage.reports.sessions")}
              emptyText={t("adminHome.dashboard_noSessionStatus")}
            />
          </div>
        </Sheet>
      </div>
    </div>
  );
}

function StatementLine({
  label,
  piasters,
  locale,
  tone,
}: {
  label: string;
  piasters: number;
  locale: string;
  tone?: "out";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--rule-2)] py-3.5 first:pt-0">
      <span className="text-[13px] text-[var(--ink-2)]">{label}</span>
      <Amount
        piasters={piasters}
        locale={locale}
        className={`text-[15px] ${tone === "out" ? "text-[var(--red)]" : "text-[var(--ink)]"}`}
      />
    </div>
  );
}
