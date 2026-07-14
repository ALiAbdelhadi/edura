"use client";

import React, { useState } from "react";
import { useList } from "@refinedev/core";
import { DollarSign, Undo2, BarChart3, Users } from "lucide-react";
import { useChildSelector, ChildSelectorBar } from "@/components/ui/child-selector";
import { LineChart } from "@/components/charts";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { StatCard } from "@/components/kit/stat-card";
import { StatusBadge } from "@/components/kit/status-badge";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner } from "@/components/kit/spinner";
import { cn } from "@repo/ui/lib/utils";

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
  const [range, setRange] = useState<[string, string] | null>(null);

  const { query, result } = useList({
    resource: "payments",
    filters: childId ? [{ field: "studentId", operator: "eq", value: childId }] : undefined,
    queryOptions: { enabled: !!childId },
  });

  const childPayments = (result?.data ?? []) as PaymentRow[];
  const isLoading = childrenLoading || query.isLoading;

  const paid = childPayments.filter((p) => p.amount > 0).reduce((a, b) => a + b.amount, 0);
  const refunds = childPayments.filter((p) => p.amount < 0).reduce((a, b) => a + Math.abs(b.amount), 0);
  const net = paid - refunds;

  const startDate = range?.[0] ?? "";
  const endDate = range?.[1] ?? "";
  const handleStart = (value: string) => {
    setRange(value || endDate ? [value, endDate] : null);
  };
  const handleEnd = (value: string) => {
    setRange(startDate || value ? [startDate, value] : null);
  };

  const paymentSeries = React.useMemo(() => {
    const sorted = [...childPayments]
      .filter((payment) => payment.paidAt)
      .sort((a, b) => new Date(a.paidAt!).getTime() - new Date(b.paidAt!).getTime());
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
        color: "var(--success)",
        points: points.map((point) => ({ x: point.x, value: point.paid })),
      },
      {
        id: "net",
        label: t("parentFees.cumulativeNet"),
        color: "var(--info)",
        points: points.map((point) => ({ x: point.x, value: point.net })),
      },
    ];
  }, [childPayments, t, formatDate]);

  const columns: ColumnDef<PaymentRow>[] = [
    {
      id: "courseName",
      header: t("parentFees.course"),
      cell: ({ row }) => row.original.courseName || "—",
    },
    {
      id: "amount",
      header: t("parentFees.amount"),
      cell: ({ row }) => {
        const isRefund = row.original.amount < 0;
        return (
          <span
            dir="ltr"
            className={cn(
              "font-semibold tabular-nums",
              isRefund ? "text-warning" : "text-success",
            )}
          >
            {isRefund ? "−" : ""}
            {formatEGP(Math.abs(row.original.amount))}
          </span>
        );
      },
    },
    {
      id: "date",
      header: t("parentFees.date"),
      cell: ({ row }) => (row.original.paidAt ? formatDate(row.original.paidAt) : "—"),
    },
    {
      id: "receiptNumber",
      header: t("parentFees.receipt"),
      cell: ({ row }) => row.original.receiptNumber || "—",
    },
    {
      id: "status",
      header: t("parentFees.status"),
      cell: ({ row }) => {
        const isRefund = row.original.amount < 0;
        return (
          <StatusBadge tone={isRefund ? "warning" : "success"}>
            {isRefund ? t("parentFees.refund") : t("status.paid")}
          </StatusBadge>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("roles.parent")}
        title={t("nav.fees")}
        actions={<ChildSelectorBar />}
      />

      {isLoading && childPayments.length === 0 ? (
        <PageSpinner label={t("parentFees.loadingPayments")} />
      ) : !childId ? (
        <EmptyState icon={Users} title={t("parentFees.noChildren")} />
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold text-foreground">
                  {t("parentFees.dateRange")}
                </span>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => handleStart(e.target.value)}
                    className="w-auto"
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => handleEnd(e.target.value)}
                    className="w-auto"
                  />
                </div>
              </div>
              <Button variant="outline" onClick={() => setRange(null)}>
                {t("parentFees.reset")}
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label={t("parentFees.paidTotal")} value={formatEGP(paid)} icon={DollarSign} />
            <StatCard label={t("parentFees.refunds")} value={formatEGP(refunds)} icon={Undo2} />
            <StatCard label={t("parentFees.netPaid")} value={formatEGP(net)} icon={BarChart3} />
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">
              {t("parentFees.paymentHistory")}
            </h2>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("parentFees.paymentTimeline")}</CardTitle>
              </CardHeader>
              <CardContent>
                <LineChart
                  series={paymentSeries}
                  showArea
                  yValueFormatter={(value) => formatShortEGP(value)}
                  emptyText={t("parentFees.noTimeline")}
                />
              </CardContent>
            </Card>
            <DataTable
              columns={columns}
              data={childPayments}
              pageSize={10}
              emptyState={t("parentFees.noPayments")}
            />
          </div>
        </>
      )}
    </div>
  );
}
