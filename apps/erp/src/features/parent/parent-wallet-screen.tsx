"use client";

import { useState } from "react";
import { useOnlineCheckout } from "@/lib/payments/use-online-checkout";
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
import { goToCheckout } from "@/lib/payments/checkout-redirect";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { asArray } from "@/lib/refine/as-array";

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
  beneficiaryName: string | null;
  createdAt: string;
};

export function ParentWalletScreen() {
  const t = useTranslations();
  const { formatEGP, formatDate } = useFormatters();

  const { query: walletQuery, result: walletRes } = useCustom({
    url: "me/parent-wallet",
    method: "get",
  });
  const { query: histQuery, result: histRes } = useCustom({
    url: "me/parent-wallet/history",
    method: "get",
    config: { query: { take: 50 } },
  });
  const { mutateAsync: mutate } = useCustomMutation();

  const wallet = (walletRes?.data as WalletInfo | undefined) ?? null;
  const entries = asArray<Entry>(histRes?.data);

  const [topupOpen, setTopupOpen] = useState(false);
  const onlineCheckout = useOnlineCheckout();
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
      toast.error(t("parentWallet.enterValidAmount"));
      return;
    }
    setBusy(true);
    try {
      const res = await mutate({
        url: "payments/parent-wallet-topup/initiate",
        method: "post",
        values: {
          amount: Math.round(egp * 100),
          method: "card",
          idempotencyKey: `pwtop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        },
      });
      const intent = (res as any)?.data?.data ?? (res as any)?.data;
      if (intent?.checkout?.url?.includes("mock-checkout")) {
        setMockIntent({ intentId: intent.id, amount: intent.amount });
      } else if (intent?.checkout?.url) {
        goToCheckout(intent.checkout.url);
      }
    } catch (err) {
      toast.error((err as { message?: string })?.message || t("parentWallet.topupFailed"));
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
      if (outcome === "success") toast.success(t("parentWallet.topupSuccess"));
      else toast.error(t("parentWallet.topupDeclined"));
    } catch (err) {
      toast.error((err as { message?: string })?.message || t("parentWallet.topupFailed"));
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
        title={t("nav.parentWallet")}
        description={t("parentWallet.subtitle")}
        actions={
          onlineCheckout ? (
            <Button onClick={() => setTopupOpen(true)}>
              <Plus className="size-4" />
              {t("parentWallet.topUp")}
            </Button>
          ) : null
        }
      />

      <StatCard
        filled
        label={t("parentWallet.balance")}
        value={formatEGP(wallet?.balance ?? 0)}
        icon={Wallet}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("parentWallet.history")}</CardTitle>
        </CardHeader>
        <CardContent>
          {histQuery.isLoading ? (
            <PageSpinner />
          ) : entries.length === 0 ? (
            <EmptyState icon={Wallet} title={t("parentWallet.noHistory")} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("parentWallet.colDate")}</TableHead>
                    <TableHead>{t("parentWallet.colType")}</TableHead>
                    <TableHead>{t("parentWallet.colChild")}</TableHead>
                    <TableHead className="text-end">{t("parentWallet.colAmount")}</TableHead>
                    <TableHead className="text-end">{t("parentWallet.colBalance")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(e.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={e.delta >= 0 ? "secondary" : "outline"}>
                          {t(`parentWallet.type_${e.type}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {e.beneficiaryName ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
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

      <Dialog open={topupOpen} onOpenChange={(o) => !busy && setTopupOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("parentWallet.topUp")}</DialogTitle>
          </DialogHeader>

          {mockIntent ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("parentWallet.mockPrompt", { amount: formatEGP(mockIntent.amount) })}
              </p>
              <div className="flex gap-2">
                <Button onClick={() => completeMock("success")} disabled={busy}>
                  {busy ? <Spinner /> : null}
                  {t("parentWallet.mockPay")}
                </Button>
                <Button variant="outline" onClick={() => completeMock("failure")} disabled={busy}>
                  {t("parentWallet.mockFail")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="mb-1 text-sm font-medium">{t("parentWallet.amountEgp")}</div>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0"
                  value={amountEgp}
                  onChange={(e) => setAmountEgp(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">{t("parentWallet.cardOnly")}</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTopupOpen(false)} disabled={busy}>
                  {t("actions.cancel")}
                </Button>
                <Button onClick={startTopup} disabled={busy}>
                  {busy ? <Spinner /> : null}
                  {t("parentWallet.continue")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
