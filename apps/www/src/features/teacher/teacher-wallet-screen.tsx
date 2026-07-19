"use client";

import { useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { Wallet, Clock4, BanknoteArrowDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { toast } from "@repo/ui/components/sonner";
import { StatCard } from "@/components/kit/stat-card";
import { PageHeader } from "@/components/kit/page-header";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { StatusBadge } from "@/components/kit/status-badge";
import { useFormatters } from "@/lib/i18n/use-formatters";

const PAYOUT_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  paid: "success",
  rejected: "danger",
  pending: "warning",
  approved: "neutral",
};

export function TeacherWalletScreen() {
  const t = useTranslations();
  const { formatEGP, formatDate } = useFormatters();

  const { query: walletQuery, result: wallet } = useCustom({
    url: "teacher/wallet",
    method: "get",
  });
  const { query: payoutsQuery, result: payoutsRes } = useCustom({
    url: "teacher/wallet/payouts",
    method: "get",
  });
  const { query: txQuery, result: txRes } = useCustom({
    url: "teacher/wallet/transactions",
    method: "get",
    config: { query: { take: 20 } },
  });
  const { mutateAsync: request } = useCustomMutation();

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [amountEgp, setAmountEgp] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const w = wallet?.data as
    | { balance: number; available: number; pendingPayouts: { count: number; amount: number } }
    | undefined;
  const payouts = (payoutsRes?.data ?? []) as any[];
  const transactions = ((txRes?.data as any)?.data ?? []) as any[];

  const submitWithdraw = async () => {
    const egp = amountEgp.trim() === "" ? null : Number(amountEgp);
    if (egp !== null && (!Number.isFinite(egp) || egp <= 0)) {
      toast.error(t("teacher.teacherWallet.invalidAmount"));
      return;
    }
    setSubmitting(true);
    try {
      await request({
        url: "teacher/wallet/payout-request",
        method: "post",
        values: egp === null ? {} : { amount: Math.round(egp * 100) },
      });
      toast.success(t("teacher.teacherWallet.requestSubmitted"));
      setWithdrawOpen(false);
      setAmountEgp("");
      walletQuery.refetch();
      payoutsQuery.refetch();
    } catch (err: any) {
      toast.error(err?.message || t("teacher.teacherWallet.requestFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (walletQuery.isLoading) return <PageSpinner label={t("teacher.teacherWallet.loading")} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.wallet")}
        description={t("teacher.teacherWallet.description")}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t("teacher.teacherWallet.balance")} value={formatEGP(w?.balance ?? 0)} icon={Wallet} accent />
        <StatCard
          label={t("teacher.teacherWallet.available")}
          value={formatEGP(w?.available ?? 0)}
          icon={BanknoteArrowDown}
        />
        <StatCard
          label={t("teacher.teacherWallet.pending")}
          value={`${formatEGP(w?.pendingPayouts.amount ?? 0)} (${w?.pendingPayouts.count ?? 0})`}
          icon={Clock4}
        />
      </div>

      <div>
        <Button
          onClick={() => setWithdrawOpen(true)}
          disabled={(w?.available ?? 0) <= 0}
        >
          <BanknoteArrowDown className="size-4" />
          {t("teacher.teacherWallet.withdraw")}
        </Button>
        {(w?.available ?? 0) <= 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">{t("teacher.teacherWallet.nothingAvailable")}</p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("teacher.teacherWallet.payoutRequests")}</CardTitle>
        </CardHeader>
        <CardContent>
          {payoutsQuery.isLoading ? (
            <PageSpinner label={t("teacher.teacherWallet.loading")} />
          ) : payouts.length === 0 ? (
            <EmptyState icon={BanknoteArrowDown} title={t("teacher.teacherWallet.noPayouts")} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("teacher.teacherWallet.amount")}</TableHead>
                  <TableHead>{t("teacher.teacherWallet.status")}</TableHead>
                  <TableHead>{t("teacher.teacherWallet.requestedAt")}</TableHead>
                  <TableHead>{t("teacher.teacherWallet.paidAt")}</TableHead>
                  <TableHead>{t("teacher.teacherWallet.note")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-semibold">{formatEGP(p.netPayable ?? 0)}</TableCell>
                    <TableCell>
                      <StatusBadge tone={PAYOUT_TONE[p.status] ?? "neutral"}>{p.status}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.paidAt ? formatDate(p.paidAt) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-destructive">{p.rejectionReason ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("teacher.teacherWallet.recentTransactions")}</CardTitle>
        </CardHeader>
        <CardContent>
          {txQuery.isLoading ? (
            <PageSpinner label={t("teacher.teacherWallet.loading")} />
          ) : transactions.length === 0 ? (
            <EmptyState icon={Wallet} title={t("teacher.teacherWallet.noTransactions")} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("teacher.teacherWallet.ref")}</TableHead>
                  <TableHead>{t("teacher.teacherWallet.type")}</TableHead>
                  <TableHead>{t("teacher.teacherWallet.amount")}</TableHead>
                  <TableHead>{t("teacher.teacherWallet.date")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="font-mono text-xs">{x.refNumber}</TableCell>
                    <TableCell>{x.type}</TableCell>
                    <TableCell className="font-semibold">{formatEGP(x.amount)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(x.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("teacher.teacherWallet.withdraw")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("teacher.teacherWallet.availableNow")}: <strong>{formatEGP(w?.available ?? 0)}</strong>
            </p>
            <div>
              <div className="mb-1 text-sm font-medium">{t("teacher.teacherWallet.amountEgp")}</div>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder={t("teacher.teacherWallet.fullBalancePlaceholder")}
                value={amountEgp}
                onChange={(e) => setAmountEgp(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">{t("teacher.teacherWallet.emptyMeansAll")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submitWithdraw} disabled={submitting}>
              {submitting ? <Spinner /> : null}
              {t("teacher.teacherWallet.confirmWithdraw")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
