"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { MetricCard } from "@repo/ui/components/metric-card";
import { Num } from "@repo/ui/components/num";
import { StatusBadge, statusTone } from "@repo/ui/components/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import type { Locale } from "@repo/ui/lib/format";

import { PageSpinner } from "@/components/kit/spinner";
import { Link } from "@/i18n/navigation";
import { OversightTable, type Col } from "./oversight-table";
import { useTeacherOversight, type Paged } from "./use-teacher-oversight";

type Row = Record<string, unknown>;

type Summary = {
  walletBalance: number;
  earned: number;
  earnedCount: number;
  commission: number;
  paidOut: number;
  pendingPayouts: { amount: number; count: number };
  settled: { amount: number; count: number };
  byType: { type: string; count: number; amount: number }[];
};

const SUB_TABS = [
  "transactions",
  "payments",
  "subscriptions",
  "payouts",
  "settlements",
  "statement",
] as const;

export function MoneyTab({ teacherId, enabled }: { teacherId: string; enabled: boolean }) {
  const t = useTranslations("teacherOversight");
  const queryStrings = useQueryStrings();
  const locale = useLocale() as Locale;
  const [sub, setSub] = useState<string>("transactions");

  const summary = useTeacherOversight<Summary>(teacherId, "finance", { enabled });
  const txns = useTeacherOversight<Paged<Row>>(teacherId, "transactions", {
    enabled: enabled && sub === "transactions",
    query: { limit: "100" },
  });
  const payments = useTeacherOversight<Paged<Row>>(teacherId, "payments", {
    enabled: enabled && sub === "payments",
    query: { limit: "100" },
  });
  const subscriptions = useTeacherOversight<Paged<Row>>(teacherId, "subscriptions", {
    enabled: enabled && sub === "subscriptions",
    query: { limit: "100" },
  });
  const payouts = useTeacherOversight<Paged<Row>>(teacherId, "payouts", {
    enabled: enabled && sub === "payouts",
    query: { limit: "100" },
  });
  const settlements = useTeacherOversight<Paged<Row>>(teacherId, "settlements", {
    enabled: enabled && sub === "settlements",
    query: { limit: "100" },
  });
  const statement = useTeacherOversight<Record<string, unknown>>(teacherId, "statement", {
    enabled: enabled && sub === "statement",
  });

  if (!enabled) return null;
  const s = summary.data;

  return (
    <div className="flex flex-col gap-4">
      {/*
        The same standing notice the centre finance tab carries, and for the
        same reason: this screen READS the ledger. `transactions`,
        `session_settlements` and `points_ledger` are append-only for the app
        role, so nothing here can be edited into a different history.
      */}
      <p className="flex gap-2 rounded-lg border border-rule bg-field p-3 text-[13px] text-ink-2">
        <Lock className="mt-px size-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-semibold text-ink">{t("appendOnlyTitle")}</span> —{" "}
          {t("appendOnlyBody")}
        </span>
      </p>

      {summary.isError ? (
        <LoadError
          message={queryStrings.loadFailed}
          onRetry={summary.refetch}
          retryLabel={queryStrings.retry}
        />
      ) : summary.isLoading || !s ? (
        <PageSpinner />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            label={t("mWallet")}
            value={<Num.Money piasters={s.walletBalance} locale={locale} sign={false} align="start" />}
          />
          <MetricCard
            label={t("mEarned")}
            value={<Num.Money piasters={s.earned} locale={locale} sign={false} align="start" />}
          />
          <MetricCard
            label={t("mCommission")}
            value={<Num.Money piasters={s.commission} locale={locale} sign={false} align="start" />}
          />
          <MetricCard
            label={t("mSettled")}
            value={
              <Num.Money piasters={s.settled.amount} locale={locale} sign={false} align="start" />
            }
          />
          <MetricCard
            label={t("mPaidOut")}
            value={<Num.Money piasters={s.paidOut} locale={locale} sign={false} align="start" />}
          />
          <MetricCard
            label={t("mPendingPayouts")}
            value={
              <Num.Money
                piasters={s.pendingPayouts.amount}
                locale={locale}
                sign={false}
                align="start"
              />
            }
          />
        </div>
      )}

      <Tabs value={sub} onValueChange={setSub}>
        <TabsList className="flex-wrap">
          {SUB_TABS.map((x) => (
            <TabsTrigger key={x} value={x}>
              {t(`sub_${x}` as never)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="transactions">
          <OversightTable
            locale={locale}
            loading={txns.isLoading}
            failed={txns.isError}
            onRetry={txns.refetch}
            rows={txns.data?.data ?? []}
            total={txns.data?.total ?? 0}
            emptyText={t("noRows")}
            columns={
              [
                { key: "refNumber", label: t("colRef"), code: true },
                { key: "type", label: t("colType") },
                {
                  key: "direction",
                  label: t("colDirection"),
                  render: (r) => (
                    <StatusBadge tone={r.direction === "in" ? "success" : "neutral"}>
                      {r.direction === "in" ? t("dirIn") : t("dirOut")}
                    </StatusBadge>
                  ),
                },
                { key: "amount", label: t("colAmount"), money: true },
                { key: "status", label: t("colStatus") },
                { key: "createdAt", label: t("colCreated"), date: true },
              ] satisfies Col[]
            }
          />
        </TabsContent>

        <TabsContent value="payments">
          <OversightTable
            locale={locale}
            loading={payments.isLoading}
            failed={payments.isError}
            onRetry={payments.refetch}
            rows={payments.data?.data ?? []}
            total={payments.data?.total ?? 0}
            emptyText={t("noRows")}
            columns={
              [
                { key: "studentName", label: t("colStudent") },
                { key: "courseTitle", label: t("colCourse") },
                { key: "amount", label: t("colAmount"), money: true },
                { key: "method", label: t("colMethod") },
                { key: "status", label: t("colStatus") },
                { key: "recordedByName", label: t("colRecordedBy") },
                { key: "paidAt", label: t("colPaidAt"), date: true },
              ] satisfies Col[]
            }
          />
        </TabsContent>

        <TabsContent value="subscriptions">
          <OversightTable
            locale={locale}
            loading={subscriptions.isLoading}
            failed={subscriptions.isError}
            onRetry={subscriptions.refetch}
            rows={subscriptions.data?.data ?? []}
            total={subscriptions.data?.total ?? 0}
            emptyText={t("noRows")}
            columns={
              [
                {
                  key: "studentName",
                  label: t("colStudent"),
                  render: (r) => (
                    <Link
                      className="focus-ledger underline underline-offset-2"
                      href={`/dashboard/superadmin/users/${String(r.studentId)}`}
                    >
                      {(r.studentName as string) ?? String(r.studentId).slice(0, 8)}
                    </Link>
                  ),
                },
                { key: "courseTitle", label: t("colCourse") },
                { key: "plan", label: t("colPlan") },
                { key: "price", label: t("colPrice"), money: true },
                {
                  key: "status",
                  label: t("colStatus"),
                  render: (r) => (
                    <StatusBadge tone={statusTone(String(r.status))}>
                      {String(r.status)}
                    </StatusBadge>
                  ),
                },
                { key: "periodEnd", label: t("colCoversUntil"), date: true },
              ] satisfies Col[]
            }
          />
        </TabsContent>

        <TabsContent value="payouts">
          <OversightTable
            locale={locale}
            loading={payouts.isLoading}
            failed={payouts.isError}
            onRetry={payouts.refetch}
            rows={payouts.data?.data ?? []}
            total={payouts.data?.total ?? 0}
            emptyText={t("noRows")}
            columns={
              [
                { key: "centerName", label: t("colCenter") },
                { key: "grossAmount", label: t("colGross"), money: true },
                { key: "commission", label: t("colCommission"), money: true },
                { key: "netPayable", label: t("colNet"), money: true },
                {
                  key: "status",
                  label: t("colStatus"),
                  render: (r) => (
                    <StatusBadge tone={statusTone(String(r.status))}>
                      {String(r.status)}
                    </StatusBadge>
                  ),
                },
                { key: "externalRef", label: t("colExternalRef"), code: true },
                { key: "createdAt", label: t("colCreated"), date: true },
              ] satisfies Col[]
            }
          />
        </TabsContent>

        <TabsContent value="settlements">
          <OversightTable
            locale={locale}
            loading={settlements.isLoading}
            failed={settlements.isError}
            onRetry={settlements.refetch}
            rows={settlements.data?.data ?? []}
            total={settlements.data?.total ?? 0}
            emptyText={t("noRows")}
            columns={
              [
                { key: "courseTitle", label: t("colCourse") },
                { key: "centerName", label: t("colCenter") },
                { key: "presentCount", label: t("colPresent"), figure: true },
                { key: "perSessionPrice", label: t("colPerSession"), money: true },
                { key: "teacherTotal", label: t("colTeacherShare"), money: true },
                { key: "centerTotal", label: t("colCenterShare"), money: true },
                { key: "platformTotal", label: t("colPlatformShare"), money: true },
                { key: "createdAt", label: t("colSettledAt"), date: true },
              ] satisfies Col[]
            }
          />
        </TabsContent>

        <TabsContent value="statement">
          {statement.isLoading ? (
            <PageSpinner />
          ) : statement.isError ? (
            <LoadError
              message={queryStrings.loadFailed}
              onRetry={statement.refetch}
              retryLabel={queryStrings.retry}
            />
          ) : (
            <>
              <p className="pb-2 text-xs text-ink-2">{t("statementNote")}</p>
              <dl className="grid gap-1.5 rounded-[10px] border border-rule bg-field p-4 text-[13px]">
                {Object.entries(statement.data ?? {}).map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-ink-2">{k}</dt>
                    <dd className="min-w-0 truncate text-end text-ink" dir="ltr">
                      {v === null || v === undefined
                        ? "—"
                        : typeof v === "object"
                          ? JSON.stringify(v)
                          : String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
