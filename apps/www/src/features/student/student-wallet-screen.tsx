"use client";

import { useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { Wallet, Plus, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Badge } from "@repo/ui/components/badge";
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
import { useFormatters } from "@/lib/i18n/use-formatters";

type WalletInfo = {
  balance: number;
  minTopup: number;
  maxTopup: number;
};
type Entry = {
  id: string;
  type: "topup" | "payment" | "refund" | "adjustment";
  delta: number;
  balanceAfter: number;
  method: string | null;
  refNumber: string | null;
  reason: string | null;
  createdAt: string;
};

const TYPE_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  topup: "success",
  refund: "success",
  payment: "warning",
  adjustment: "neutral",
};

export function StudentWalletScreen() {
  const t = useTranslations();
  const { formatEGP, formatDate } = useFormatters();

  const { query: walletQuery, result: walletRes } = useCustom({ url: "me/wallet", method: "get" });
  const { query: histQuery, result: histRes } = useCustom({
    url: "me/wallet/history",
    method: "get",
    config: { query: { take: 50 } },
  });
  const { mutateAsync: mutate } = useCustomMutation();

  const wallet = (walletRes?.data as WalletInfo | undefined) ?? null;
  const entries = ((histRes?.data as Entry[] | undefined) ?? []) as Entry[];

  const [topupOpen, setTopupOpen] = useState(false);
  const [amountEgp, setAmountEgp] = useState("");
  const [busy, setBusy] = useState(false);
  const [mockIntent, setMockIntent] = useState<{ intentId: string; amount: number } | null>(null);

  const refetch = () => {
    walletQuery.refetch();
    histQuery.refetch();
  };

  const startTopup = async () => {
    const egp = Number(amountEgp);
    if (!Number.isFinite(egp) || egp <= 0) {
      toast.error(t("studentWallet.enterValidAmount"));
      return;
    }
    setBusy(true);
    try {
      const res = await mutate({
        url: "payments/wallet-topup/initiate",
        method: "post",
        values: {
          amount: Math.round(egp * 100),
          method: "card",
          idempotencyKey: `wtop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        },
      });
      const intent = (res as any)?.data?.data ?? (res as any)?.data;
      if (intent?.checkout?.url?.includes("mock-checkout")) {
        setMockIntent({ intentId: intent.id, amount: intent.amount });
      } else if (intent?.checkout?.url) {
        window.open(intent.checkout.url, "_blank");
        setTopupOpen(false);
      }
    } catch (err) {
      toast.error((err as { message?: string })?.message || t("studentWallet.topupFailed"));
    } finally {
      setBusy(false);
    }
  };

  const completeMock = async (outcome: "success" | "failure") => {
    if (!mockIntent) return;
    setBusy(true);
    try {
      await mutate({
        url: `payments/intents/${mockIntent.intentId}/mock-complete`,
        method: "post",
        values: { outcome },
      });
      if (outcome === "success") toast.success(t("studentWallet.topupSuccess"));
      else toast.error(t("studentWallet.topupDeclined"));
    } catch (err) {
      toast.error((err as { message?: string })?.message || t("studentWallet.topupFailed"));
    } finally {
      setBusy(false);
      setMockIntent(null);
      setTopupOpen(false);
      setAmountEgp("");
      refetch();
    }
  };

  if (walletQuery.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.wallet")}
        description={t("studentWallet.subtitle")}
        actions={
          <Button onClick={() => setTopupOpen(true)}>
            <Plus className="size-4" />
            {t("studentWallet.topUp")}
          </Button>
        }
      />

      <StatCard
        filled
        label={t("studentWallet.balance")}
        value={formatEGP(wallet?.balance ?? 0)}
        icon={Wallet}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("studentWallet.history")}</CardTitle>
        </CardHeader>
        <CardContent>
          {histQuery.isLoading ? (
            <PageSpinner />
          ) : entries.length === 0 ? (
            <EmptyState icon={Wallet} title={t("studentWallet.noHistory")} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("studentWallet.colDate")}</TableHead>
                    <TableHead>{t("studentWallet.colType")}</TableHead>
                    <TableHead className="text-end">{t("studentWallet.colAmount")}</TableHead>
                    <TableHead className="text-end">{t("studentWallet.colBalance")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(e.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={TYPE_TONE[e.type] === "success" ? "secondary" : "outline"}>
                          {t(`studentWallet.type_${e.type}`)}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={`text-end font-medium ${e.delta >= 0 ? "text-success" : "text-destructive"}`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {e.delta >= 0 ? (
                            <ArrowUpRight className="size-3" />
                          ) : (
                            <ArrowDownRight className="size-3" />
                          )}
                          {e.delta >= 0 ? "+" : "−"}
                          {formatEGP(Math.abs(e.delta))}
                        </span>
                      </TableCell>
                      <TableCell className="text-end font-semibold">
                        {formatEGP(e.balanceAfter)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top-up dialog */}
      <Dialog open={topupOpen} onOpenChange={(o) => !busy && setTopupOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("studentWallet.topUp")}</DialogTitle>
          </DialogHeader>

          {mockIntent ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("studentWallet.mockPrompt", { amount: formatEGP(mockIntent.amount) })}
              </p>
              <div className="flex gap-2">
                <Button onClick={() => completeMock("success")} disabled={busy}>
                  {busy ? <Spinner /> : null}
                  {t("studentWallet.mockPay")}
                </Button>
                <Button variant="outline" onClick={() => completeMock("failure")} disabled={busy}>
                  {t("studentWallet.mockFail")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="mb-1 text-sm font-medium">{t("studentWallet.amountEgp")}</div>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0"
                  value={amountEgp}
                  onChange={(e) => setAmountEgp(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">{t("studentWallet.cardOnly")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("studentWallet.cashHint")}</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTopupOpen(false)} disabled={busy}>
                  {t("actions.cancel")}
                </Button>
                <Button onClick={startTopup} disabled={busy}>
                  {busy ? <Spinner /> : null}
                  {t("studentWallet.continue")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
