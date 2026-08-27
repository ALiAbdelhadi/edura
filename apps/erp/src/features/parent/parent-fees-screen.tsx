"use client";

import React, { useState } from "react";
import { DateRangeField } from "@/components/kit/date-range-field";
import { useList } from "@refinedev/core";
import { Users } from "lucide-react";
import { useChildSelector } from "@/components/ui/child-selector";
import { LineChart } from "@/components/charts";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { ReceiptLink } from "@/features/receipts/receipt-link";
import {
  Figure,
  LimitNote,
  Metric,
  Money,
  SectionHead,
  SkeletonRows,
  TotalLine,
} from "./ledger-kit";

type PaymentRow = {
  id?: string;
  _id?: string;
  courseName?: string;
  amount: number;
  paidAt?: string;
  receiptNumber?: string;
};

export function ParentFeesScreen() {
  const t = useTranslations();
  const { formatEGP, formatShortEGP, formatDate } = useFormatters();
  const { childId, childName, isLoading: childrenLoading } = useChildSelector();
  const [range, setRange] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  });

  const { query, result } = useList({
    resource: "payments",
    filters: childId
      ? [{ field: "studentId", operator: "eq", value: childId }]
      : undefined,
    queryOptions: { enabled: !!childId },
  });

  const all = (result?.data ?? []) as PaymentRow[];
  const isLoading = childrenLoading || query.isLoading;

  const rows = React.useMemo(() => {
    if (!range.start && !range.end) return all;
    return all.filter((p) => {
      if (!p.paidAt) return false;
      const d = p.paidAt.slice(0, 10);
      if (range.start && d < range.start) return false;
      if (range.end && d > range.end) return false;
      return true;
    });
  }, [all, range]);

  const paid = rows
    .filter((p) => p.amount > 0)
    .reduce((a, b) => a + b.amount, 0);
  const refunds = rows
    .filter((p) => p.amount < 0)
    .reduce((a, b) => a + Math.abs(b.amount), 0);
  const net = paid - refunds;
  const filtered = rows.length !== all.length;

  const paymentSeries = React.useMemo(() => {
    const sorted = [...rows]
      .filter((p) => p.paidAt)
      .sort(
        (a, b) => new Date(a.paidAt!).getTime() - new Date(b.paidAt!).getTime(),
      );
    let cumulativePaid = 0;
    let cumulativeNet = 0;
    const points = sorted.map((payment) => {
      const amount = payment.amount ?? 0;
      if (amount > 0) cumulativePaid += amount;
      cumulativeNet += amount;
      return {
        x: formatDate(payment.paidAt, { month: "short", day: "numeric" }),
        paid: cumulativePaid,
        net: cumulativeNet,
      };
    });
    return [
      {
        id: "paid",
        label: t("parentFees.cumulativePaid"),
        color: "var(--chart-2)",
        points: points.map((p) => ({ x: p.x, value: p.paid })),
      },
      {
        id: "net",
        label: t("parentFees.cumulativeNet"),
        color: "var(--chart-1)",
        points: points.map((p) => ({ x: p.x, value: p.net })),
      },
    ];
  }, [rows, t, formatDate]);

  const columns: ColumnDef<PaymentRow>[] = [
    {
      id: "courseName",
      header: t("parentFees.course"),
      cell: ({ row }) => (
        <span className="text-ink">{row.original.courseName || "—"}</span>
      ),
    },
    {
      id: "date",
      header: t("parentFees.date"),
      cell: ({ row }) =>
        row.original.paidAt ? (
          <Figure className="text-[12px] text-ink-2">
            {formatDate(row.original.paidAt)}
          </Figure>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      id: "receiptNumber",
      header: t("parentFees.receipt"),
      cell: ({ row }) => {
        const paymentId = row.original.id ?? row.original._id;
        if (!row.original.receiptNumber) return <span className="text-ink-3">—</span>;
        return (
          <div className="flex flex-col items-start gap-0.5">
            <Figure className="text-[12px] text-ink-2">
              {row.original.receiptNumber}
            </Figure>
            {paymentId ? <ReceiptLink paymentId={paymentId} /> : null}
          </div>
        );
      },
    },
    {
      id: "status",
      header: t("parentFees.status"),
      cell: ({ row }) => {
        const isRefund = row.original.amount < 0;
        return (
          <span
            className={
              isRefund
                ? "rounded-md bg-rule-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-2"
                : "rounded-md bg-teal-soft px-1.5 py-0.5 text-[11px] font-medium text-teal"
            }
          >
            {isRefund ? t("parentFees.refund") : t("status.paid")}
          </span>
        );
      },
    },
    {
      id: "amount",
      header: () => (
        <span className="block text-end">{t("parentFees.amount")}</span>
      ),
      cell: ({ row }) => (
        <span className="block text-end">
          <Money
            amount={row.original.amount}
            format={formatEGP}
          />
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={t("roles.parent")}
        title={
          childName ? t("parentFees.titleFor", { name: childName }) : t("nav.fees")
        }
      />

      {isLoading && all.length === 0 ? (
        <SkeletonRows rows={4} />
      ) : !childId ? (
        <EmptyState icon={Users} title={t("parentFees.noChildren")} />
      ) : (
        <>
          <div className="rounded-xl border border-rule bg-field p-4">
            <span className="eyebrow">{t("parentFees.payingEyebrow")}</span>
            <LimitNote className="mt-1.5">
              {t("parentFees.payLimit")}
            </LimitNote>
          </div>

          <section className="flex flex-col gap-3">
            <SectionHead
              eyebrow={t("parentFees.periodEyebrow")}
              title={t("parentFees.paymentHistory")}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <DateRangeField
                    value={{ from: range.start, to: range.end }}
                    onChange={(next) => setRange({ start: next.from, end: next.to })}
                    formatDate={formatDate}
                    placeholder={t("parentFees.rangeStart")}
                  />
                  {filtered ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRange({ start: "", end: "" })}
                    >
                      {t("parentFees.reset")}
                    </Button>
                  ) : null}
                </div>
              }
            />

            <div className="grid gap-3 sm:grid-cols-3">
              <Metric
                label={t("parentFees.paidTotal")}
                value={<Money amount={paid} format={formatEGP} tone="paid" />}
                reason={t("parentFees.paidReason", { count: rows.length })}
              />
              <Metric
                label={t("parentFees.refunds")}
                value={
                  <Money amount={refunds} format={formatEGP} tone="plain" />
                }
                reason={t("parentFees.refundsReason")}
              />
              <Metric
                label={t("parentFees.netPaid")}
                value={<Money amount={net} format={formatEGP} tone="plain" />}
                reason={t("parentFees.netReason")}
              />
            </div>

            <div className="rounded-xl border border-rule bg-sheet p-4">
              <span className="eyebrow">
                {t("parentFees.paymentTimeline")}
              </span>
              <div className="mt-3" dir="ltr">
                <LineChart
                  series={paymentSeries}
                  showArea
                  yValueFormatter={(value) => formatShortEGP(value)}
                  emptyText={t("parentFees.noTimeline")}
                />
              </div>
            </div>

            <DataTable
              columns={columns}
              data={rows}
              pageSize={10}
              emptyState={
                filtered
                  ? t("parentFees.noPaymentsInRange")
                  : t("parentFees.noPayments")
              }
            />

            {rows.length > 0 ? (
              <div className="rounded-xl border border-rule bg-sheet px-4 py-3">
                <TotalLine
                  label={t("parentFees.netPaid")}
                  value={
                    <Money amount={net} format={formatEGP} tone="plain" />
                  }
                />
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
