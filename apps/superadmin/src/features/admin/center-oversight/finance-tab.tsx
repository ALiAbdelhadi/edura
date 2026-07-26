"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { StatCard } from "@/components/kit/stat-card";
import { PageSpinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useOversight, type Paged } from "./use-oversight";
import { MoneyActions, ExpensesCard } from "./money-actions";

// ---------------------------------------------------------------------------
// The full financial picture for one center — six ledgers plus the wallet
// balance. Every value on this screen is READ-ONLY: there is no input, no
// mutation hook, and no endpoint behind it that writes. The banner says so to
// the operator, and the API says so to the client.
// ---------------------------------------------------------------------------

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
  const { formatEGP, formatDate, formatNumber } = useFormatters();
  const [sub, setSub] = useState("transactions");

  const summary = useOversight<Summary>(centerId, "finance");
  // The ledger list reuses the accountant's own service, whose envelope calls
  // the rows `items` rather than `data`.
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

  const s = summary.data;

  return (
    <div className="space-y-4">
      <Alert>
        <Lock className="size-4" />
        <AlertTitle>The record below is append-only</AlertTitle>
        <AlertDescription>
          Every ledger on this page is history and cannot be edited or deleted — the database
          revokes UPDATE and DELETE on the transaction and points ledgers for the application
          role, super admins included. The counter actions below <em>add</em> to it through the
          real flows (recorded payment, wallet top-up, walk-in subscription, payout request);
          nothing anywhere rewrites a past row or sets a balance directly.
        </AlertDescription>
      </Alert>

      {summary.isLoading || !s ? (
        <PageSpinner />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Center wallet balance" value={formatEGP(s.walletBalance)} hint="read-only" />
            <StatCard
              label="Payments received"
              value={formatEGP(s.payments.amount)}
              hint={`${formatNumber(s.payments.count)} payment(s)`}
            />
            <StatCard
              label="Refunds"
              value={formatEGP(Math.abs(s.payments.refundAmount))}
              hint={`${formatNumber(s.payments.refundCount)} refund(s)`}
            />
            <StatCard
              label="Center share settled"
              value={formatEGP(s.settlements.centerTotal)}
              hint={`${formatNumber(s.settlements.count)} session settlement(s)`}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ledger by type</CardTitle>
              </CardHeader>
              <CardContent>
                {s.transactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No ledger rows for this center.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-end">Count</TableHead>
                        <TableHead className="text-end">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {s.transactions.map((t) => (
                        <TableRow key={`${t.type}-${t.status}`}>
                          <TableCell className="font-medium">{t.type}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{t.status}</Badge>
                          </TableCell>
                          <TableCell className="text-end tabular-nums">{formatNumber(t.count)}</TableCell>
                          <TableCell className="text-end tabular-nums">{formatEGP(t.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Settlement split &amp; payouts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Platform</p>
                    <p className="font-semibold tabular-nums">{formatEGP(s.settlements.platformTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Center</p>
                    <p className="font-semibold tabular-nums">{formatEGP(s.settlements.centerTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Teacher</p>
                    <p className="font-semibold tabular-nums">{formatEGP(s.settlements.teacherTotal)}</p>
                  </div>
                </div>
                {s.payouts.length === 0 ? (
                  <p className="text-muted-foreground">No payouts for this center.</p>
                ) : (
                  <ul className="space-y-1">
                    {s.payouts.map((p) => (
                      <li key={p.status} className="flex items-center justify-between">
                        <Badge variant="secondary">{p.status}</Badge>
                        <span className="tabular-nums">
                          {formatNumber(p.count)} · {formatEGP(p.netPayable)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="text-xs text-muted-foreground">Student wallet movements here</span>
                  <span className="tabular-nums">
                    {formatNumber(s.walletMovements.count)} · {formatEGP(s.walletMovements.netDelta)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <MoneyActions centerId={centerId} />

          <Tabs value={sub} onValueChange={setSub}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="payouts">Payouts</TabsTrigger>
              <TabsTrigger value="settlements">Settlements</TabsTrigger>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="expenses">Expenses</TabsTrigger>
              <TabsTrigger value="wallet">Wallet movements</TabsTrigger>
            </TabsList>

            <TabsContent value="transactions">
              <LedgerTable
                loading={txns.isLoading}
                rows={txns.data?.items ?? []}
                total={txns.data?.total ?? 0}
                columns={[
                  { key: "refNumber", label: "Ref" },
                  { key: "type", label: "Type" },
                  { key: "status", label: "Status" },
                  { key: "paymentMethod", label: "Method" },
                  { key: "amount", label: "Amount", money: true },
                  { key: "createdAt", label: "Date", date: true },
                ]}
                formatEGP={formatEGP}
                formatDate={formatDate}
              />
            </TabsContent>
            <TabsContent value="payments">
              <p className="mb-2 text-xs text-muted-foreground">
                &ldquo;Mark refunded&rdquo; on a payment is a <strong>status flag</strong> — it
                writes no ledger reversal and returns no money. Use the finance refund flow to
                actually return money; it is limited to one refund per payment.
              </p>
              <LedgerTable
                loading={payments.isLoading}
                rows={payments.data?.data ?? []}
                total={payments.data?.total ?? 0}
                columns={[
                  { key: "receiptNumber", label: "Receipt" },
                  { key: "studentName", label: "Student" },
                  { key: "status", label: "Status" },
                  { key: "amount", label: "Amount", money: true },
                  { key: "recordedByName", label: "Recorded by" },
                  { key: "paidAt", label: "Paid at", date: true },
                ]}
                formatEGP={formatEGP}
                formatDate={formatDate}
              />
            </TabsContent>
            <TabsContent value="payouts">
              <LedgerTable
                loading={payouts.isLoading}
                rows={payouts.data?.data ?? []}
                total={payouts.data?.total ?? 0}
                columns={[
                  { key: "beneficiaryName", label: "Beneficiary" },
                  { key: "beneficiaryType", label: "Type" },
                  { key: "status", label: "Status" },
                  { key: "grossAmount", label: "Gross", money: true },
                  { key: "commission", label: "Commission", money: true },
                  { key: "netPayable", label: "Net", money: true },
                  { key: "createdAt", label: "Created", date: true },
                ]}
                formatEGP={formatEGP}
                formatDate={formatDate}
              />
            </TabsContent>
            <TabsContent value="settlements">
              <LedgerTable
                loading={settlements.isLoading}
                rows={settlements.data?.data ?? []}
                total={settlements.data?.total ?? 0}
                columns={[
                  { key: "courseTitle", label: "Course" },
                  { key: "teacherName", label: "Teacher" },
                  { key: "pricingMethod", label: "Method" },
                  { key: "presentCount", label: "Present" },
                  { key: "platformTotal", label: "Platform", money: true },
                  { key: "centerTotal", label: "Center", money: true },
                  { key: "teacherTotal", label: "Teacher", money: true },
                  { key: "createdAt", label: "Settled", date: true },
                ]}
                formatEGP={formatEGP}
                formatDate={formatDate}
              />
            </TabsContent>
            <TabsContent value="invoices">
              <LedgerTable
                loading={invoices.isLoading}
                rows={invoices.data?.data ?? []}
                total={invoices.data?.total ?? 0}
                columns={[
                  { key: "invoiceNumber", label: "Number" },
                  { key: "type", label: "Type" },
                  { key: "status", label: "Status" },
                  { key: "subtotal", label: "Subtotal", money: true },
                  { key: "commission", label: "Commission", money: true },
                  { key: "netAmount", label: "Net", money: true },
                  { key: "createdAt", label: "Issued", date: true },
                ]}
                formatEGP={formatEGP}
                formatDate={formatDate}
              />
            </TabsContent>
            <TabsContent value="expenses">
              <ExpensesCard centerId={centerId} />
            </TabsContent>
            <TabsContent value="wallet">
              <p className="mb-2 text-xs text-muted-foreground">
                Student wallet movements credited at this center (cash top-ups taken at its
                counter). Spending elsewhere belongs to that other center&apos;s books.
              </p>
              <LedgerTable
                loading={wallet.isLoading}
                rows={wallet.data?.data ?? []}
                total={wallet.data?.total ?? 0}
                columns={[
                  { key: "studentName", label: "Student" },
                  { key: "type", label: "Type" },
                  { key: "method", label: "Method" },
                  { key: "delta", label: "Delta", money: true },
                  { key: "balanceAfter", label: "Balance after", money: true },
                  { key: "createdAt", label: "Date", date: true },
                ]}
                formatEGP={formatEGP}
                formatDate={formatDate}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

type Col = { key: string; label: string; money?: boolean; date?: boolean };

function LedgerTable({
  loading,
  rows,
  total,
  columns,
  formatEGP,
  formatDate,
}: {
  loading: boolean;
  rows: Record<string, unknown>[];
  total: number;
  columns: Col[];
  formatEGP: (v: number | null | undefined) => string;
  formatDate: (v: string | Date | null | undefined, o?: Intl.DateTimeFormatOptions) => string;
}) {
  if (loading) return <PageSpinner />;
  if (!rows.length) {
    return <p className="p-4 text-sm text-muted-foreground">No rows.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Showing {rows.length} of {total}
      </p>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={c.money ? "text-end" : undefined}>
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={(r.id as string) ?? i}>
                {columns.map((c) => {
                  const v = r[c.key];
                  return (
                    <TableCell key={c.key} className={c.money ? "text-end tabular-nums" : undefined}>
                      {v == null
                        ? "—"
                        : c.money
                          ? formatEGP(v as number)
                          : c.date
                            ? formatDate(v as string, { dateStyle: "medium", timeStyle: "short" })
                            : String(v)}
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
