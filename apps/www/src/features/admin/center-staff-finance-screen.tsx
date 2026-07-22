"use client";

// Center accountant — READ-ONLY finance. This center's numbers only (RLS binds
// every query to the accountant's own center). No mutation controls exist on
// this screen, and every write endpoint 403s for a center_accountant.
import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@repo/ui/components/card";
import { Badge } from "@repo/ui/components/badge";
import { PageHeader } from "@/components/kit/page-header";
import { Spinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { api } from "@/lib/api/client";

type NetProfit = { revenue: number; expenses: number; netProfit: number };
type WalletInfo = { balance: number; available: number };
type Txn = { id: string; type: string; amount: number; paymentMethod: string | null; createdAt: string };

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold text-foreground">{value}</span>
    </Card>
  );
}

export function CenterStaffFinanceScreen() {
  const t = useTranslations();
  const { formatEGP } = useFormatters();
  const [pnl, setPnl] = useState<NetProfit | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("reports/net-profit").json<{ data: NetProfit }>().then((r) => setPnl(r.data)).catch(() => {}),
      api.get("center/wallet").json<{ data: WalletInfo }>().then((r) => setWallet(r.data)).catch(() => {}),
      api
        .get("center/wallet/transactions")
        .json<{ data: { data: Txn[] } }>()
        .then((r) => setTxns(r.data.data ?? []))
        .catch(() => {}),
    ]).finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("centerStaff.can.finance")}
        description={t("centerStaff.roleDesc.center_accountant")}
        actions={
          <Badge variant="outline" className="text-muted-foreground">
            {t("centerStaff.roleName.center_accountant")}
          </Badge>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label={t("common.revenue")} value={formatEGP(pnl?.revenue ?? 0)} />
        <Kpi label={t("common.expenses")} value={formatEGP(pnl?.expenses ?? 0)} />
        <Kpi label={t("common.netProfit")} value={formatEGP(pnl?.netProfit ?? 0)} />
        <Kpi label={t("nav.wallet")} value={formatEGP(wallet?.balance ?? 0)} />
        <Kpi label={t("centerStaff.can.finance")} value={formatEGP(wallet?.available ?? 0)} />
      </div>

      <Card className="p-0">
        <div className="border-b border-border px-4 py-3 font-semibold text-foreground">
          {t("nav.transactions")}
        </div>
        {txns.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">—</p>
        ) : (
          <ul>
            {txns.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0"
              >
                <span className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {tx.type}
                  </Badge>
                  {tx.paymentMethod ? (
                    <span className="text-xs text-muted-foreground">{tx.paymentMethod}</span>
                  ) : null}
                </span>
                <span className="font-medium text-foreground">{formatEGP(tx.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
