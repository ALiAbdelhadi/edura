"use client";

import React from "react";
import { useCustom } from "@refinedev/core";
import { DollarSign, TrendingUp, TrendingDown, Wallet, FileCheck, AlertTriangle, Info, LineChart as LineChartIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Alert, AlertTitle } from "@repo/ui/components/alert";
import { StatCard } from "@/components/kit/stat-card";
import { PageHeader } from "@/components/kit/page-header";
import { EmptyState } from "@/components/kit/empty-state";
import { LineChart } from "@/components/charts";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { StatCardsSkeleton } from "@/components/ui/skeletons";

type FinanceKpis = {
  platformCommission: number;
  grossLessonRevenue: number;
  totalRefunds: number;
  pendingPayouts: { count: number; amount: number };
  totalExpenses: number;
};
type AlertsResp = { alerts: { level: "info" | "warning"; code: string; message: string; value?: number }[] };
type RevenueResp = { period: string; series: { period: string; grossRevenue: number; platformCommission: number; payouts: number; refunds: number }[] };

export function FinanceDashboard() {
  const t = useTranslations();
  const { formatShortEGP, formatNumber } = useFormatters();

  const { query: kq, result: kpis } = useCustom<FinanceKpis>({ url: "finance/dashboard", method: "get" });
  const { result: alertsRes } = useCustom<AlertsResp>({ url: "finance/alerts", method: "get" });
  const { result: rev } = useCustom<RevenueResp>({ url: "finance/reports/revenue", method: "get", config: { query: { period: "monthly" } } });

  const k = kpis?.data;
  const alerts = alertsRes?.data?.alerts ?? [];
  const series = rev?.data?.series ?? [];

  if (kq.isLoading) {
    return (
      <div className="flex w-full flex-col gap-6">
        <PageHeader eyebrow={t("nav.finance")} title={t("financeHome.title")} description={t("financeHome.description")} />
        <StatCardsSkeleton count={5} />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader eyebrow={t("nav.finance")} title={t("financeHome.title")} description={t("financeHome.description")} />

      {/* Step 3 ledger caveat — remove when Step 4 reconciles cash payments
          into the transaction ledger (CLAUDE.md decision #11). */}
      <Alert role="status" className="bg-info/12 text-info">
        <Info />
        <AlertTitle>
          The transaction ledger currently reflects online payments only — cash
          payments are not reconciled yet (pending the subscriptions step). Do
          not read these figures as complete finance data.
        </AlertTitle>
      </Alert>

      {alerts.length > 0 && (
        <div className="flex w-full flex-col gap-2">
          {alerts.map((a) => (
            <Alert
              key={a.code}
              role="status"
              className={a.level === "warning" ? "bg-warning/12 text-warning" : "bg-info/12 text-info"}
            >
              {a.level === "warning" ? <AlertTriangle /> : <Info />}
              <AlertTitle>{a.message}</AlertTitle>
            </Alert>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label={t("financeHome.platformCommission")} value={formatShortEGP(k?.platformCommission)} icon={DollarSign} accent />
        <StatCard label={t("financeHome.grossRevenue")} value={formatShortEGP(k?.grossLessonRevenue)} icon={TrendingUp} />
        <StatCard label={t("financeHome.refunds")} value={formatShortEGP(k?.totalRefunds)} icon={TrendingDown} />
        <StatCard
          label={t("nav.payouts")}
          value={formatShortEGP(k?.pendingPayouts.amount)}
          icon={Wallet}
          hint={`${formatNumber(k?.pendingPayouts.count)} ${t("status.pending")}`}
        />
        <StatCard label={t("nav.expenses")} value={formatShortEGP(k?.totalExpenses)} icon={FileCheck} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("financeHome.revenueChartTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {series.length > 0 ? (
            <LineChart
              series={[
                { id: "gross", label: t("financeHome.grossRevenue"), color: "var(--primary)", points: series.map((p) => ({ x: p.period.slice(5), value: Math.round(p.grossRevenue / 100) })) },
                { id: "commission", label: t("common.commission"), color: "var(--success)", points: series.map((p) => ({ x: p.period.slice(5), value: Math.round(p.platformCommission / 100) })) },
              ]}
              height={280}
              yValueFormatter={(v) => formatShortEGP(v * 100)}
            />
          ) : (
            <EmptyState icon={LineChartIcon} title={t("common.noRevenueYet")} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
