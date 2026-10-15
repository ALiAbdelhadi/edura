"use client";

import { useCustom } from "@refinedev/core";
import { BarChart, LineChart } from "@/components/charts";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { MetricCard } from "@repo/ui/components/metric-card";
import { Num } from "@repo/ui/components/num";
import { useQueryStrings } from "@repo/ui/components/query-section";
import type { Locale } from "@repo/ui/lib/format";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { useVisibilityTrigger } from "@/lib/api/use-on-demand";
import { asKey } from "@/lib/i18n/keys";

type Kpis = {
  centers: { active: number; pending: number };
  users: { teachers: number; students: number; parents: number };
  pendingRegistrations: number;
  platformRevenue: number;
  grossLessonRevenue: number;
  lessonsCompleted: number;
};

type RevenueChart = { period: string; series: { period: string; value: number }[] };
type GrowthChart = { series: Record<string, string | number>[] };

const GROWTH_ROLES = ["student", "teacher", "parent", "center_admin"] as const;

function compactMoney(piasters: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.round(piasters / 100));
}

function compactCount(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG", {
    notation: "compact",
    maximumFractionDigits: 0,
  }).format(value);
}

export function PlatformTrends() {
  const t = useTranslations();
  const tg = useTranslations();
  const locale = useLocale() as Locale;
  const queryStrings = useQueryStrings();
  const [period, setPeriod] = useState<"monthly" | "weekly">("monthly");

  const [visible, setVisible] = useState(false);
  const reveal = useVisibilityTrigger(useCallback(() => setVisible(true), []));

  const kpisQ = useCustom<Kpis>({
    url: "admin/dashboard/kpis",
    method: "get",
    queryOptions: { enabled: visible },
  });
  const revenueQ = useCustom<RevenueChart>({
    url: "admin/dashboard/revenue-chart",
    method: "get",
    config: { query: { period } },
    queryOptions: { enabled: visible },
  });
  const growthQ = useCustom<GrowthChart>({
    url: "admin/dashboard/user-growth-chart",
    method: "get",
    queryOptions: { enabled: visible },
  });

  const kpis = kpisQ.result?.data as Kpis | undefined;
  const revenue = revenueQ.result?.data as RevenueChart | undefined;
  const growth = growthQ.result?.data as GrowthChart | undefined;

  return (
    <section ref={reveal} className="flex flex-col gap-5">
      <Eyebrow locale={locale}>{t("trends.title")}</Eyebrow>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={t("trends.activeCenters")}
          value={<Num.Figure value={kpis?.centers?.active ?? 0} locale={locale} />}
        />
        <MetricCard
          label={t("trends.students")}
          value={<Num.Figure value={kpis?.users?.students ?? 0} locale={locale} />}
        />
        <MetricCard
          label={t("trends.lessonsCompleted")}
          value={<Num.Figure value={kpis?.lessonsCompleted ?? 0} locale={locale} />}
        />
        <MetricCard
          label={t("trends.platformRevenue")}
          value={<Num.Money piasters={kpis?.platformRevenue ?? 0} locale={locale} />}
          meta={t("trends.platformRevenueHint")}
        />
      </div>

      <div className="rounded-xl border border-rule bg-sheet p-4 shadow-(--lift)">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[15px] font-bold text-ink">{t("trends.revenueTitle")}</h3>
          <div className="flex gap-1">
            {(["monthly", "weekly"] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                onClick={() => setPeriod(p)}
                className={
                  period === p
                    ? "focus-ledger rounded-lg border border-indigo bg-indigo-soft px-3 py-1 text-[13px] font-semibold text-indigo"
                    : "focus-ledger rounded-lg border border-rule px-3 py-1 text-[13px] text-ink-2 hover:bg-rule-2"
                }
              >
                {t(asKey(`trends.period_${p}`))}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <LineChart
            height={220}
            showArea
            series={[
              {
                id: "commission",
                label: t("trends.commission"),
                points: (revenue?.series ?? []).map((b) => ({ x: b.period, value: b.value })),
              },
            ]}
            yValueFormatter={(v) => compactMoney(v, locale)}
            loading={!visible || revenueQ.query.isLoading}
            loadingText={tg("common.loading")}
            error={revenueQ.query.isError ? queryStrings.loadFailed : undefined}
            emptyText={t("trends.noData")}
          />
        </div>
      </div>
      <div className="rounded-xl border border-rule bg-sheet p-4 shadow-(--lift)">
        <h3 className="text-[15px] font-bold text-ink">{t("trends.growthTitle")}</h3>
        <div className="mt-4">
          <BarChart
            height={220}
            stacked
            data={(growth?.series ?? []).map((row) => ({
              label: String(row.period ?? ""),
              ...Object.fromEntries(
                GROWTH_ROLES.map((r) => [r, Number(row[r] ?? 0)]),
              ),
            }))}
            series={GROWTH_ROLES.map((r) => ({
              key: r,
              label: tg(asKey(`roles.${r}`)),
            }))}
            yValueFormatter={(v) => compactCount(v, locale)}
            loading={!visible || growthQ.query.isLoading}
            loadingText={tg("common.loading")}
            error={growthQ.query.isError ? queryStrings.loadFailed : undefined}
            emptyText={t("trends.noData")}
          />
        </div>
      </div>
    </section>
  );
}
