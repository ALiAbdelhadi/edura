"use client";

import React from "react";
import { useCustom } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertTriangle,
  BanknoteArrowDown,
  FileCheck,
  Info,
  LineChart as LineChartIcon,
  RefreshCcw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { MetricCard } from "@repo/ui/components/metric-card";
import { Num } from "@repo/ui/components/num";
import { LineChart } from "@/components/charts";
import { SkeletonRows } from "@repo/ui/components/ledger";
import { QuerySection } from "@repo/ui/components/query-section";
import { cn } from "@repo/ui/lib/utils";
import type { Locale } from "@repo/ui/lib/format";

import { PageHeader } from "@/components/kit/page-header";
import { EmptyState } from "@/components/kit/empty-state";
import { StatCardsSkeleton } from "@/components/ui/skeletons";
import { asArray } from "@/lib/refine/as-array";

type FinanceKpis = {
  platformCommission: number;
  grossLessonRevenue: number;
  totalRefunds: number;
  pendingPayouts: { count: number; amount: number };
  totalExpenses: number;
};
type AlertsResp = {
  alerts: { level: "info" | "warning"; code: string; message: string; value?: number }[];
};
type RevenueResp = {
  period: string;
  series: {
    period: string;
    grossRevenue: number;
    platformCommission: number;
    payouts: number;
    refunds: number;
  }[];
};

export function FinanceDashboard() {
  const t = useTranslations();
  const locale = useLocale() as Locale;

  const { query: kq, result: kpis } = useCustom<FinanceKpis>({
    url: "finance/dashboard",
    method: "get",
  });
  const { query: alertsQuery, result: alertsRes } = useCustom<AlertsResp>({
    url: "finance/alerts",
    method: "get",
  });
  const { query: revQuery, result: rev } = useCustom<RevenueResp>({
    url: "finance/reports/revenue",
    method: "get",
    config: { query: { period: "monthly" } },
  });

  const k = kpis?.data;
  const alerts = asArray<any>(alertsRes?.data?.alerts);
  const series = asArray<any>(rev?.data?.series);

  const head = (title: string) => (
    <PageHeader
      eyebrow={t("nav.finance")}
      title={title}
      description={t("financeHome.description")}
      rule
    />
  );

  if (kq.isLoading) {
    return (
      <div className="flex w-full flex-col gap-6">
        {head(t("financeHome.loading"))}
        <StatCardsSkeleton count={4} />
      </div>
    );
  }

  if (kq.isError) {
    const denied = (kq.error as { statusCode?: number } | null)?.statusCode === 403;
    return (
      <div className="flex w-full flex-col gap-6">
        {head(t(denied ? "financeHome.deniedTitle" : "financeHome.loadError"))}
        <EmptyState
          tone={denied ? "denied" : "error"}
          icon={AlertTriangle}
          title={t(denied ? "financeHome.deniedTitle" : "financeHome.loadError")}
          description={t(denied ? "financeHome.deniedBody" : "financeHome.loadErrorBody")}
          action={
            denied ? undefined : (
              <Button variant="outline" onClick={() => kq.refetch()}>
                <RefreshCcw className="size-4" aria-hidden="true" />
                {t("financeHome.retry")}
              </Button>
            )
          }
        />
      </div>
    );
  }

  const net = (k?.platformCommission ?? 0) - (k?.totalRefunds ?? 0);

  return (
    <div className="flex w-full flex-col gap-6">
      {head(t("financeHome.title"))}

      <QuerySection query={alertsQuery} skeleton={<SkeletonRows rows={1} />}>
        {alerts.length > 0 && (
          <div className="flex w-full flex-col gap-2">
            {alerts.map((a) => (
              <p
                key={a.code}
                role="status"
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-3 text-[13px]",
                  a.level === "warning"
                    ? "border-amber bg-amber-soft text-amber"
                    : "border-rule bg-field text-ink-2",
                )}
              >
                {a.level === "warning" ? (
                  <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <Info className="size-4 shrink-0" aria-hidden="true" />
                )}
                {a.message}
              </p>
            ))}
          </div>
        )}
      </QuerySection>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          href="/dashboard/finance/payouts"
          icon={BanknoteArrowDown}
          tone="pending"
          label={t("nav.payouts")}
          value={<Num.Figure value={k?.pendingPayouts.count ?? 0} locale={locale} />}
          secondary={
            <Num.Money
              piasters={k?.pendingPayouts.amount}
              locale={locale}
              tone="in"
              sign={false}
            />
          }
          fact={t("financeHome.pendingFact")}
        />

        <MetricCard
          icon={TrendingUp}
          label={t("financeHome.grossRevenue")}
          value={
            <Num.Money
              piasters={k?.grossLessonRevenue}
              locale={locale}
              sign={false}
              short
              align="start"
            />
          }
        />

        <MetricCard
          icon={TrendingDown}
          label={t("financeHome.refunds")}
          value={
            <Num.Money piasters={k?.totalRefunds} locale={locale} tone="out" short align="start" />
          }
        />

        <MetricCard
          icon={FileCheck}
          label={t("financeHome.netToPlatform")}
          value={<Num.Money piasters={net} locale={locale} tone="in" sign={false} short align="start" />}
          fact={t("financeHome.netFact")}
        />
      </div>

      <section className="rounded-xl border border-rule bg-sheet p-5 shadow-[var(--lift)]">
        <header className="mb-4">
          <Eyebrow locale={locale}>{t("financeHome.revenueChartTitle")}</Eyebrow>
          <p className="mt-1 text-[13px] text-ink-2">{t("financeHome.revenueChartSubtitle")}</p>
        </header>

        <QuerySection
          query={revQuery}
          skeleton={<SkeletonRows rows={3} />}
          isEmpty={series.length === 0}
          empty={<EmptyState tone="empty" icon={LineChartIcon} title={t("common.noRevenueYet")} />}
        >
          <LineChart
            series={[
              {
                id: "gross",
                label: t("financeHome.grossRevenue"),
                points: series.map((p) => ({
                  x: p.period.slice(5),
                  value: Math.round(p.grossRevenue / 100),
                })),
              },
              {
                id: "commission",
                label: t("common.commission"),
                points: series.map((p) => ({
                  x: p.period.slice(5),
                  value: Math.round(p.platformCommission / 100),
                })),
              },
            ]}
            height={280}
            yValueFormatter={(v) => formatAxis(v * 100, locale)}
          />
        </QuerySection>
      </section>
    </div>
  );
}

function formatAxis(piasters: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.round(piasters / 100));
}
