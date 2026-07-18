"use client";

import React from "react";
import { useCustom } from "@refinedev/core";
import Link from "next/link";
import {
  Building2,
  Users,
  UserRound,
  DollarSign,
  Clock,
  TrendingUp,
  BookOpenCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { LineChart } from "@/components/charts";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { StatCard } from "@/components/kit/stat-card";
import { StatCardsSkeleton } from "@/components/ui/skeletons";

type Kpis = {
  centers: { active: number; pending: number };
  users: { teachers: number; students: number; parents: number };
  pendingRegistrations: number;
  platformRevenue: number;
  grossLessonRevenue: number;
  lessonsCompleted: number;
};
type RevenuePoint = { period: string; value: number };

export function SuperAdminDashboard() {
  const t = useTranslations();
  const { formatShortEGP, formatNumber } = useFormatters();

  const { query: kq, result: kpis } = useCustom<Kpis>({ url: "admin/dashboard/kpis", method: "get" });
  const { result: rev } = useCustom<{ period: string; series: RevenuePoint[] }>({
    url: "admin/dashboard/revenue-chart",
    method: "get",
    config: { query: { period: "monthly" } },
  });

  const k = kpis?.data;
  const series = rev?.data?.series ?? [];

  if (kq.isLoading) {
    return (
      <div className="flex w-full flex-col gap-6">
        <StatCardsSkeleton count={4} />
        <StatCardsSkeleton count={3} />
      </div>
    );
  }

  const hasPending = (k?.pendingRegistrations ?? 0) > 0;

  return (
    <div className="flex w-full flex-col gap-6">
      {hasPending && (
        <Card className="border-warning/40 bg-warning/10">
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-warning" aria-hidden />
              <p className="font-medium text-foreground">
                {formatNumber(k?.pendingRegistrations)} {t("nav.registrations")} — {t("adminHome.awaitingReview")}
              </p>
            </div>
            <Button asChild>
              <Link href="/dashboard/superadmin/registrations">{t("actions.review")}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label={t("nav.centers")} value={k?.centers.active ?? 0} icon={Building2} />
        <StatCard label={t("nav.teachers")} value={k?.users.teachers ?? 0} icon={UserRound} />
        <StatCard label={t("nav.students")} value={k?.users.students ?? 0} icon={Users} />
        <div className="relative">
          <StatCard label={t("nav.registrations")} value={k?.pendingRegistrations ?? 0} icon={Clock} />
          {hasPending && (
            <span
              aria-hidden
              className="absolute -top-1 -end-1 size-2.5 rounded-full bg-destructive ring-2 ring-background"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label={t("adminHome.platformRevenue")} value={formatShortEGP(k?.platformRevenue)} icon={DollarSign} accent />
        <StatCard label={t("adminHome.grossLessonRevenue")} value={formatShortEGP(k?.grossLessonRevenue)} icon={TrendingUp} />
        <StatCard label={t("adminHome.lessonsCompleted")} value={k?.lessonsCompleted ?? 0} icon={BookOpenCheck} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("adminHome.platformRevenueChartTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {series.length > 0 ? (
            <LineChart
              series={[
                {
                  id: "platform-revenue",
                  label: t("adminHome.platformRevenueSeriesLabel"),
                  color: "var(--primary)",
                  points: series.map((p) => ({ x: p.period.slice(5), value: Math.round(p.value / 100) })),
                },
              ]}
              height={260}
              yValueFormatter={(v) => formatShortEGP(v * 100)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("common.noRevenueYet")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
