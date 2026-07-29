"use client";

// Parent fees — the money surface.
//
// Two rules govern this screen and they pull in the same direction.
//
// 1. FULL LEDGER TREATMENT, NO WARMTH. Parents are the users holding the
//    money. Softening the figures they are asked to act on would be the exact
//    dishonesty this system exists to prevent. Every amount is mono, tabular,
//    bidi-isolated and end-aligned; the total closes with a double rule.
//
// 2. NO PAY AFFORDANCE, TODAY. Both payment entry points are
//    `requireRole("student")` — `/api/v1/payments/initiate` and
//    `/api/v1/subscriptions/checkout`. A parent cannot pay for their child, and
//    the payer-vs-beneficiary model is a separate planned effort that has not
//    landed. So there is no Pay button, and no disabled one either: this portal
//    does not ship an affordance the API would refuse. There is a plain line
//    saying who can pay instead.
//
//    When the model lands, the button goes where <PaymentRoute/> is documented
//    below — not scattered through the table.
import React, { useState } from "react";
import { useList } from "@refinedev/core";
import { Users } from "lucide-react";
import { useChildSelector, ChildSelectorBar } from "@/components/ui/child-selector";
import { LineChart } from "@/components/charts";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
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
  _id?: string;
  courseName?: string;
  amount: number;
  paidAt?: string;
  receiptNumber?: string;
};

export function ParentFeesScreen() {
  const t = useTranslations();
  const { formatEGP, formatShortEGP, formatDate } = useFormatters();
  const { childId, isLoading: childrenLoading } = useChildSelector();
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

  // Filtering happens here rather than server-side because the range is a
  // read-only lens on an already-fetched ledger; nothing is recomputed on the
  // server and no figure below can drift from the rows shown.
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
      cell: ({ row }) =>
        row.original.receiptNumber ? (
          <Figure className="text-[12px] text-ink-2">
            {row.original.receiptNumber}
          </Figure>
        ) : (
          <span className="text-ink-3">—</span>
        ),
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
      // Numeric columns are end-aligned. Always.
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
        title={t("nav.fees")}
        actions={<ChildSelectorBar />}
      />

      {isLoading && all.length === 0 ? (
        <SkeletonRows rows={4} />
      ) : !childId ? (
        <EmptyState icon={Users} title={t("parentFees.noChildren")} />
      ) : (
        <>
          {/* Who can pay. This is the honest replacement for a Pay button the
              API would reject — see the header comment. */}
          <div className="rounded-xl border border-rule bg-field p-4">
            <span className="eyebrow">{t("parentFees.payingEyebrow")}</span>
            <LimitNote className="mt-1.5">
              {t("parentFees.payLimit")}
            </LimitNote>
          </div>
          {/* <PaymentRoute/> — when the payer-vs-beneficiary model lands, the
              pay affordance belongs HERE, replacing the note above, as a single
              two-step commit carrying its own amount. Not a per-row button. */}

          <section className="flex flex-col gap-3">
            <SectionHead
              eyebrow={t("parentFees.periodEyebrow")}
              title={t("parentFees.paymentHistory")}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="date"
                    aria-label={t("parentFees.rangeStart")}
                    value={range.start}
                    onChange={(e) =>
                      setRange((r) => ({ ...r, start: e.target.value }))
                    }
                    className="num w-auto"
                  />
                  <span aria-hidden className="text-ink-3">
                    –
                  </span>
                  <Input
                    type="date"
                    aria-label={t("parentFees.rangeEnd")}
                    value={range.end}
                    onChange={(e) =>
                      setRange((r) => ({ ...r, end: e.target.value }))
                    }
                    className="num w-auto"
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

            {/* Cumulative timeline. Kept from the previous screen — the
                redesign is additive; series colours now come from the token
                layer instead of --success/--info. */}
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
