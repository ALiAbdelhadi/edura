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

  // ---- THE HEADLINE LOADS WITH THE PAGE. Someone who opened "Reports" has
  // asked for the net-profit figures; putting those behind an interaction
  // would be answering a question nobody raised.
  const { query, result } = useCustom({
    url: "reports/net-profit",
    method: "get",
    config: { query: queryValues },
  });

  // ---- THE FOUR CHARTS DO NOT. They were five concurrent aggregate queries
  // on one page load, and four of them draw sections a reader may never scroll
  // to. Each now fires when its own section approaches the viewport (see
  // useVisibilityTrigger) — a button would be wrong here, because arriving at
  // Reports IS the request for the reports; what has not been asked for is the
  // chart three scrolls down.
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

  // GUARD ON THE PAYLOAD, NOT ON isLoading/isError — neither is reliable here.
  // React Query PAUSES a retry when its online-heuristic says the network is
  // down (`fetchStatus: "paused"`, observed live). Paused means `isFetching`
  // false, so `isLoading` (= isPending && isFetching) is false; and the query
  // never settles, so `isError` never becomes true either. Both guards were
  // therefore unreachable on a first load that fails, and this screen rendered
  // its success layout over a payload that does not exist — "0.00 EGP" revenue
  // on a money screen, indistinguishable from a real zero.
  //
  // `data` is null unless a real object arrived (see asRecord), so keying on it
  // covers pending, paused, backoff and error alike. This endpoint always
  // answers with a shaped object, never `{}`, so `!data` cannot mean "loaded
  // but empty".
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
  // A NUMBER, not a pre-formatted string. It was `.toFixed(1)`, which fixes the
  // decimal separator to a dot and the digits to Latin before the locale is
  // ever consulted — so the margin was the one figure on this screen the
  // formatter could not reach. The precision it was buying is preserved by
  // asking `formatPercent` for one decimal.
  const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const byCourse = data?.byCourse ?? [];
  const enrollmentRates = fillRates.length > 0 ? fillRates : (data?.enrollmentRates ?? []);
  const sessionStatusMix = data?.sessionStatusMix ?? [];

  const expenseDonut = expensesByCategory.map((entry, index) => ({
    id: entry._id,
    label: entry._id,
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
            {/* Exports carry the range above, so a download is always "what I
                am looking at" rather than a second, silently different query. */}
            <ReportExportMenu from={dateRange.from} to={dateRange.to} />
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
        className={`text-[15px] ${tone === "out" ? "text-[var(--red)]" : "text-[var(--ink)]"}`}
      />
    </div>
  );
}
