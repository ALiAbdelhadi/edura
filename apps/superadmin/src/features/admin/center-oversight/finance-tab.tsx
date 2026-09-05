"use client";

import type * as React from "react";
import { useState } from "react";
import { Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Eyebrow } from "@repo/ui/components/eyebrow";
import { MetricCard } from "@repo/ui/components/metric-card";
import { Num, ProseCount } from "@repo/ui/components/num";
import { StatusBadge } from "@repo/ui/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import type { Locale } from "@repo/ui/lib/format";

import { PageSpinner } from "@/components/kit/spinner";
import { asKey } from "@/lib/i18n/keys";
import { useAdminGet, useOversight, type Paged } from "./use-oversight";
import { MoneyActions, ExpensesCard } from "./money-actions";

type Summary = {
  walletBalance: number;
  transactions: { type: string; status: string; count: number; amount: number }[];
  payments: { count: number; amount: number; refundCount: number; refundAmount: number };
  payouts: { status: string; count: number; netPayable: number }[];
  settlements: { count: number; platformTotal: number; centerTotal: number; teacherTotal: number };
  invoices: { status: string; count: number; netAmount: number }[];
  walletMovements: { count: number; netDelta: number };
};

export function FinanceTab({ centerId }: { centerId: string }) {
  const t = useTranslations("oversight");
  const tt = useTranslations();
  const queryStrings = useQueryStrings();
  const locale = useLocale() as Locale;
  const [sub, setSub] = useState("transactions");

  const forms = (stem: string) => ({
    one: t(asKey(`${stem}_one`)),
    two: t.has(asKey(`${stem}_two`)) ? t(asKey(`${stem}_two`)) : undefined,
    few: t.has(asKey(`${stem}_few`)) ? t(asKey(`${stem}_few`)) : undefined,
    many: t(asKey(`${stem}_many`)),
  });

  const summary = useOversight<Summary>(centerId, "finance");
  const txns = useOversight<{ items: Record<string, unknown>[]; total: number }>(
    centerId,
    "transactions",
    { enabled: sub === "transactions", query: { limit: "100" } },
  );
  const payments = useOversight<Paged<Record<string, unknown>>>(centerId, "payments", {
    enabled: sub === "payments",
    query: { limit: "100" },
  });
  const payouts = useOversight<Paged<Record<string, unknown>>>(centerId, "payouts", {
    enabled: sub === "payouts",
    query: { limit: "100" },
  });
  const settlements = useOversight<Paged<Record<string, unknown>>>(centerId, "settlements", {
    enabled: sub === "settlements",
    query: { limit: "100" },
  });
  const invoices = useOversight<Paged<Record<string, unknown>>>(centerId, "invoices", {
    enabled: sub === "invoices",
    query: { limit: "100" },
  });
  const wallet = useOversight<Paged<Record<string, unknown>> & { scope: string }>(
    centerId,
    "wallet",
    { enabled: sub === "wallet", query: { limit: "100" } },
  );
  const statement = useOversight<Record<string, unknown>>(centerId, "statement", {
    enabled: sub === "statement",
  });

  // The one payment an operator opens, fetched then -- the list carries no
  // allocation detail and shipping it with every row would be waste.
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const paymentQ = useAdminGet<Record<string, unknown>>(
    `admin/centers/${centerId}/money/payments/${paymentId ?? ""}`,
    { enabled: !!paymentId },
  );

  const s = summary.data;

  return (
    <div className="flex flex-col gap-4">
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
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label={t("walletBalance")}
              value={<Num.Money piasters={s.walletBalance} locale={locale} sign={false} short align="start" />}
              meta={
                <Eyebrow locale={locale} marker={false}>
                  {t("readOnly")}
                </Eyebrow>
              }
            />
            <MetricCard
              label={t("paymentsReceived")}
              value={<Num.Money piasters={s.payments.amount} locale={locale} tone="in" sign={false} short align="start" />}
              fact={<ProseCount count={s.payments.count} locale={locale} forms={forms("payment")} />}
            />
            <MetricCard
              label={t("refunds")}
              value={
                <Num.Money
                  piasters={Math.abs(s.payments.refundAmount)}
                  locale={locale}
                  tone="out"
                  short
                  align="start"
                />
              }
              fact={<ProseCount count={s.payments.refundCount} locale={locale} forms={forms("refund")} />}
            />
            <MetricCard
              label={t("centerSettled")}
              value={<Num.Money piasters={s.settlements.centerTotal} locale={locale} sign={false} short align="start" />}
              fact={<ProseCount count={s.settlements.count} locale={locale} forms={forms("settlement")} />}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <section className="rounded-xl border border-rule bg-sheet p-4 shadow-[var(--lift)]">
              <Eyebrow locale={locale} className="mb-3">
                {t("ledgerByType")}
              </Eyebrow>
              {s.transactions.length === 0 ? (
                <p className="text-[13px] text-ink-3">{t("noLedgerRows")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-rule bg-field hover:bg-field">
                      {(["colType", "colStatus", "colCount", "colAmount"] as const).map((c) => (
                        <TableHead
                          key={c}
                          className={
                            c === "colCount" || c === "colAmount"
                              ? "h-[34px] px-3 text-end"
                              : "h-[34px] px-3"
                          }
                        >
                          <Eyebrow locale={locale} marker={false}>
                            {t(c)}
                          </Eyebrow>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.transactions.map((r) => (
                      <TableRow key={`${r.type}-${r.status}`} className="border-rule-2">
                        <TableCell className="px-3 py-[7px] text-[13px] font-medium text-ink">
                          {tt(asKey(`adminHome.today_txType_${r.type}`))}
                        </TableCell>
                        <TableCell className="px-3 py-[7px]">
                          <StatusBadge tone="neutral">{tt(asKey(`status.${r.status}`))}</StatusBadge>
                        </TableCell>
                        <TableCell className="px-3 py-[7px] text-end">
                          <Num.Figure value={r.count} locale={locale} />
                        </TableCell>
                        <TableCell className="px-3 py-[7px] text-end">
                          <Num.Money piasters={r.amount} locale={locale} tone="muted" sign={false} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>

            <section className="rounded-xl border border-rule bg-sheet p-4 shadow-[var(--lift)]">
              <Eyebrow locale={locale} className="mb-3">
                {t("splitAndPayouts")}
              </Eyebrow>

              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["platform", s.settlements.platformTotal],
                    ["center", s.settlements.centerTotal],
                    ["teacher", s.settlements.teacherTotal],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <p className="text-[11px] text-ink-3">{t(k)}</p>
                    <Num.Money piasters={v} locale={locale} sign={false} align="start" className="font-semibold" />
                  </div>
                ))}
              </div>

              {s.payouts.length === 0 ? (
                <p className="mt-3 text-[13px] text-ink-3">{t("noPayouts")}</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-1">
                  {s.payouts.map((p) => (
                    <li key={p.status} className="flex items-center justify-between gap-2">
                      <StatusBadge tone="neutral">{tt(asKey(`status.${p.status}`))}</StatusBadge>
                      <span className="flex items-baseline gap-1.5">
                        <Num.Figure value={p.count} locale={locale} className="text-[11px] text-ink-3" />
                        <Num.Money piasters={p.netPayable} locale={locale} tone="muted" sign={false} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-rule pt-2">
                <span className="text-[11px] text-ink-3">{t("walletMovementsHere")}</span>
                <span className="flex items-baseline gap-1.5">
                  <Num.Figure value={s.walletMovements.count} locale={locale} className="text-[11px] text-ink-3" />
                  <Num.Money piasters={s.walletMovements.netDelta} locale={locale} tone="muted" sign={false} />
                </span>
              </div>
            </section>
          </div>

          <MoneyActions centerId={centerId} />

          <Tabs value={sub} onValueChange={setSub}>
            <TabsList className="flex-wrap">
              {(
                [
                  ["transactions", "tabTransactions"],
                  ["payments", "tabPayments"],
                  ["payouts", "tabPayouts"],
                  ["settlements", "tabSettlements"],
                  ["invoices", "tabInvoices"],
                  ["expenses", "tabExpenses"],
                  ["wallet", "tabWallet"],
                  ["statement", "tabStatement"],
                ] as const
              ).map(([v, k]) => (
                <TabsTrigger key={v} value={v}>
                  {t(k)}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="transactions">
              <LedgerTable
                locale={locale}
                loading={txns.isLoading}
                failed={txns.isError}
                onRetry={txns.refetch}
                rows={txns.data?.items ?? []}
                total={txns.data?.total ?? 0}
                columns={[
                  { key: "refNumber", label: t("colRef"), code: true },
                  { key: "type", label: t("colType") },
                  { key: "status", label: t("colStatus") },
                  { key: "paymentMethod", label: t("colMethod") },
                  { key: "amount", label: t("colAmount"), money: true },
                  { key: "createdAt", label: t("colDate"), date: true },
                ]}
              />
            </TabsContent>

            <TabsContent value="payments">
              <p className="mb-2 text-xs text-ink-3">{t("refundFlagNote")}</p>
              <LedgerTable
                locale={locale}
                loading={payments.isLoading}
                failed={payments.isError}
                onRetry={payments.refetch}
                onRowClick={(r) => setPaymentId(String(r.id ?? ""))}
                rowLabel={(r) => String(r.receiptNumber ?? r.id ?? "")}
                rows={payments.data?.data ?? []}
                total={payments.data?.total ?? 0}
                columns={[
                  { key: "receiptNumber", label: t("colReceipt"), code: true },
                  { key: "studentName", label: t("colStudent") },
                  { key: "status", label: t("colStatus") },
                  { key: "amount", label: t("colAmount"), money: true },
                  { key: "recordedByName", label: t("colRecordedBy") },
                  { key: "paidAt", label: t("colPaidAt"), date: true },
                ]}
              />
            </TabsContent>

            <TabsContent value="payouts">
              <LedgerTable
                locale={locale}
                loading={payouts.isLoading}
                failed={payouts.isError}
                onRetry={payouts.refetch}
                rows={payouts.data?.data ?? []}
                total={payouts.data?.total ?? 0}
                columns={[
                  { key: "beneficiaryName", label: t("colBeneficiary") },
                  { key: "beneficiaryType", label: t("colType") },
                  { key: "status", label: t("colStatus") },
                  { key: "grossAmount", label: t("colGross"), money: true },
                  { key: "commission", label: t("colCommission"), money: true },
                  { key: "netPayable", label: t("colNet"), money: true },
                  { key: "createdAt", label: t("colCreated"), date: true },
                ]}
              />
            </TabsContent>

            <TabsContent value="settlements">
              <LedgerTable
                locale={locale}
                loading={settlements.isLoading}
                failed={settlements.isError}
                onRetry={settlements.refetch}
                rows={settlements.data?.data ?? []}
                total={settlements.data?.total ?? 0}
                columns={[
                  { key: "courseTitle", label: t("colCourse") },
                  { key: "teacherName", label: t("colTeacher") },
                  { key: "pricingMethod", label: t("colMethod") },
                  { key: "presentCount", label: t("colPresent"), figure: true },
                  { key: "platformTotal", label: t("platform"), money: true },
                  { key: "centerTotal", label: t("center"), money: true },
                  { key: "teacherTotal", label: t("teacher"), money: true },
                  { key: "createdAt", label: t("colSettled"), date: true },
                ]}
              />
            </TabsContent>

            <TabsContent value="invoices">
              <LedgerTable
                locale={locale}
                loading={invoices.isLoading}
                failed={invoices.isError}
                onRetry={invoices.refetch}
                rows={invoices.data?.data ?? []}
                total={invoices.data?.total ?? 0}
                columns={[
                  { key: "invoiceNumber", label: t("colNumber"), code: true },
                  { key: "type", label: t("colType") },
                  { key: "status", label: t("colStatus") },
                  { key: "subtotal", label: t("colSubtotal"), money: true },
                  { key: "commission", label: t("colCommission"), money: true },
                  { key: "netAmount", label: t("colNet"), money: true },
                  { key: "createdAt", label: t("colIssued"), date: true },
                ]}
              />
            </TabsContent>

            <TabsContent value="expenses">
              <ExpensesCard centerId={centerId} />
            </TabsContent>

            <TabsContent value="statement">
              {statement.isLoading ? (
                <PageSpinner />
              ) : statement.isError ? (
                <LoadError
                  message={queryStrings.loadFailed}
                  onRetry={() => statement.refetch()}
                  retryLabel={queryStrings.retry}
                />
              ) : (
                <dl className="grid gap-1.5 rounded-[10px] border border-rule bg-field p-4 text-[13px]">
                  {Object.entries(statement.data ?? {}).map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-3">
                      <dt className="shrink-0 text-ink-2">{k}</dt>
                      <dd className="min-w-0 truncate text-end text-ink" dir="ltr">
                        {typeof v === "number" ? (
                          <Num.Money piasters={v} locale={locale} sign={false} />
                        ) : v === null || v === undefined ? (
                          "—"
                        ) : typeof v === "object" ? (
                          JSON.stringify(v)
                        ) : (
                          String(v)
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </TabsContent>

            <TabsContent value="wallet">
              <p className="mb-2 text-xs text-ink-3">{t("walletScopeNote")}</p>
              <LedgerTable
                locale={locale}
                loading={wallet.isLoading}
                failed={wallet.isError}
                onRetry={wallet.refetch}
                rows={wallet.data?.data ?? []}
                total={wallet.data?.total ?? 0}
                columns={[
                  { key: "studentName", label: t("colStudent") },
                  { key: "type", label: t("colType") },
                  { key: "method", label: t("colMethod") },
                  { key: "delta", label: t("colDelta"), money: true },
                  { key: "balanceAfter", label: t("colBalanceAfter"), money: true },
                  { key: "createdAt", label: t("colDate"), date: true },
                ]}
              />
            </TabsContent>
          </Tabs>

          <Dialog open={!!paymentId} onOpenChange={(o) => !o && setPaymentId(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{t("paymentDetailTitle")}</DialogTitle>
              </DialogHeader>
              {paymentQ.isLoading ? (
                <PageSpinner />
              ) : paymentQ.isError ? (
                <LoadError
                  message={queryStrings.loadFailed}
                  onRetry={() => paymentQ.refetch()}
                  retryLabel={queryStrings.retry}
                />
              ) : (
                <dl className="grid gap-1.5 rounded-[10px] border border-rule bg-field p-4 text-[13px]">
                  {Object.entries(paymentQ.data ?? {}).map(([k, v]) => (
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
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

type Col = {
  key: string;
  label: string;
  money?: boolean;
  date?: boolean;
  code?: boolean;
  figure?: boolean;
};

function LedgerTable({
  locale,
  loading,
  failed,
  onRetry,
  rows,
  total,
  columns,
  onRowClick,
  rowLabel,
}: {
  locale: Locale;
  loading: boolean;
  failed?: boolean;
  onRetry?: () => void;
  rows: Record<string, unknown>[];
  total: number;
  columns: Col[];
  onRowClick?: (row: Record<string, unknown>) => void;
  rowLabel?: (row: Record<string, unknown>) => string;
}) {
  const t = useTranslations("oversight");
  const queryStrings = useQueryStrings();
  if (loading) return <PageSpinner />;
  if (failed) {
    return (
      <LoadError
        message={queryStrings.loadFailed}
        onRetry={() => onRetry?.()}
        retryLabel={queryStrings.retry}
      />
    );
  }
  if (!rows.length) return <p className="p-4 text-[13px] text-ink-3">{t("noRows")}</p>;

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-baseline gap-1.5 text-[11px] text-ink-3">
        {t("showing")}
        <Num.Figure value={rows.length} locale={locale} />
        {t("of")}
        <Num.Figure value={total} locale={locale} />
      </p>

      <div className="overflow-x-auto rounded-xl border border-rule bg-sheet shadow-[var(--lift)]">
        <Table>
          <TableHeader>
            <TableRow className="border-rule bg-field hover:bg-field">
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={c.money || c.figure ? "h-[34px] px-3 text-end" : "h-[34px] px-3"}
                >
                  <Eyebrow locale={locale} marker={false}>
                    {c.label}
                  </Eyebrow>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow
                key={(r.id as string) ?? i}
                className={
                  onRowClick ? "focus-ledger cursor-pointer border-rule-2" : "border-rule-2"
                }
                {...(onRowClick
                  ? {
                      role: "button" as const,
                      tabIndex: 0,
                      "aria-label": rowLabel?.(r),
                      onClick: () => onRowClick(r),
                      onKeyDown: (e: React.KeyboardEvent<HTMLTableRowElement>) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        if (e.target !== e.currentTarget) return;
                        e.preventDefault();
                        onRowClick(r);
                      },
                    }
                  : {})}
              >
                {columns.map((c) => {
                  const v = r[c.key];
                  return (
                    <TableCell
                      key={c.key}
                      className={
                        c.money || c.figure ? "px-3 py-[7px] text-end" : "px-3 py-[7px] text-[13px]"
                      }
                    >
                      {v == null ? (
                        "—"
                      ) : c.money ? (
                        <Num.Money piasters={v as number} locale={locale} tone="muted" sign={false} />
                      ) : c.figure ? (
                        <Num.Figure value={v as number} locale={locale} />
                      ) : c.date ? (
                        <Num.Date
                          value={v as string}
                          locale={locale}
                          options={{ dateStyle: "medium", timeStyle: "short" }}
                          className="text-[11px] text-ink-3"
                        />
                      ) : c.code ? (
                        <Num.Code>{String(v)}</Num.Code>
                      ) : (
                        String(v)
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
