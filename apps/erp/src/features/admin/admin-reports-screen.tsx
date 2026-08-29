/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { BarChart, DonutChart } from "@/components/charts";
import { DateRangeField, EMPTY_RANGE, type DateKeyRange } from "@/components/kit/date-range-field";
import { PageSpinner } from "@/components/kit/spinner";
import { enrollmentFunnelBarData, sessionStatusDonutData } from "@/lib/analytics/transforms";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useCustom } from "@refinedev/core";
import { useOnDemand, useVisibilityTrigger } from "@/lib/api/use-on-demand";
import { ReportExportMenu } from "./report-export-menu";
import { Button } from "@repo/ui/components/button";
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
import { asRecord } from "@/lib/refine/as-record";

export function AdminReportsScreen() {
  const t = useTranslations();
  const { formatShortEGP, formatDate, formatPercent, locale } = useFormatters();
  const fmtEGP = formatShortEGP;
  const [dateRange, setDateRange] = React.useState<DateKeyRange>(EMPTY_RANGE);
  const [granularity, setGranularity] = React.useState<"week" | "month">("month");

  const resetRange = () => setDateRange(EMPTY_RANGE);

  const queryValues = React.useMemo(
    () => ({
      ...(dateRange.from ? { from: dateRange.from } : {}),
      ...(dateRange.to ? { to: dateRange.to } : {}),
      granularity,
    }),
    [dateRange, granularity],
  );

  const { query, result } = useCustom({
    url: "reports/net-profit",
    method: "get",
    config: { query: queryValues },
  });

  const trendReq = useOnDemand<any>("reports/revenue-timeseries", { query: queryValues });
  const expensesReq = useOnDemand<any>("reports/expenses-timeseries", { query: queryValues });
  const fillRateReq = useOnDemand<any>("reports/course-fill-rates", { query: queryValues });
  const funnelReq = useOnDemand<any>("reports/enrollment-funnel", { query: queryValues });

  const cashflowRef = useVisibilityTrigger(trendReq.request);
  const expensesRef = useVisibilityTrigger(expensesReq.request);
  const fillRateRef = useVisibilityTrigger(fillRateReq.request);
  const funnelRef = useVisibilityTrigger(funnelReq.request);

  const data = asRecord<any>(result?.data) ?? null;
  const trendData = (trendReq.data?.series ?? []) as any[];
  const expensesByCategory = (expensesReq.data?.byCategory ?? []) as any[];
  const fillRates = (fillRateReq.data?.items ?? []) as any[];
  const funnel = (funnelReq.data?.items ?? []) as any[];

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

  if (!data) {
    return <PageSpinner label={t("adminManage.reports.loadingReports")} />;
  }

  const revenue = data?.revenue ?? 0;
  const expenses = data?.expenses ?? 0;
  const netProfit = data?.netProfit ?? 0;
  const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const byCourse = data?.byCourse ?? [];
  const enrollmentRates = fillRates.length > 0 ? fillRates : (data?.enrollmentRates ?? []);
  const sessionStatusMix = data?.sessionStatusMix ?? [];
  const attendanceByCourse = (data?.attendanceByCourse ?? []) as Array<{
    title: string;
    attendanceRatePct: number;
  }>;

  const expenseDonut = expensesByCategory.map((entry, index) => ({
    id: entry.category,
    label: entry.category,
    value: entry.subtotal ?? 0,
    color: CATEGORICAL[index % CATEGORICAL.length],
  }));

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title={t("nav.reports")}
        subtitle={t("adminManage.reports.subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeField
              value={dateRange}
              onChange={setDateRange}
              formatDate={formatDate}
              placeholder={t("adminManage.reports.pickDateRange")}
            />

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
            <ReportExportMenu from={dateRange.from} to={dateRange.to} />
          </div>
        }
      />

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
                  {formatPercent(margin, { decimals: 1 })}{" "}
                  {t("adminManage.reports.margin")}
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
                {formatPercent(data?.attendanceRate ?? 0)}
              </Num>
            </p>
          </div>
        </Sheet>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Sheet className="lg:col-span-2" ref={cashflowRef}>
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
        <Sheet ref={expensesRef}>
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
        <Sheet ref={fillRateRef}>
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
              yValueFormatter={(value) => formatPercent(Math.round(value))}
              emptyText={t("adminManage.reports.noEnrollmentRate")}
            />
          </div>
        </Sheet>
      </div>

      <Sheet>
        <SheetHead title={t("adminHome.dashboard_attendanceByCourse")} />
        <div className="p-[18px]">
          <BarChart
            data={attendanceByCourse.map((entry) => ({
              label: entry.title,
              rate: entry.attendanceRatePct,
            }))}
            series={[
              {
                key: "rate",
                label: t("adminHome.dashboard_attendancePercent"),
                color: CHART.count,
              },
            ]}
            horizontal
            yValueFormatter={(value) => formatPercent(Math.round(value))}
            emptyText={t("adminHome.dashboard_noCourseAttendance")}
          />
        </div>
      </Sheet>

      <div className="grid gap-4 md:grid-cols-2">
        <Sheet ref={funnelRef}>
          <SheetHead title={t("adminManage.reports.enrollmentFunnel")} />
          <div className="p-[18px]">
            <BarChart
              data={enrollmentFunnelBarData(funnel, (s) =>
                t(`status.${s}` as Parameters<typeof t>[0]),
              )}
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
              data={sessionStatusDonutData(sessionStatusMix, (s) =>
                t(`status.${s}` as Parameters<typeof t>[0]),
              )}
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
        className={`text-[15px] ${tone === "out" ? "text-destructive" : "text-[var(--ink)]"}`}
      />
    </div>
  );
}
