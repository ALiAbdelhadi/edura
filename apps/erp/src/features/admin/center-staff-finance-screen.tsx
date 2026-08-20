"use client";

import { api } from "@/lib/api/client";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useEffect, useState } from "react";
import { Amount, Badge, DateText, EmptyState, PageHead, Sheet, SheetHead } from "./ledger";

type NetProfit = { revenue: number; expenses: number; netProfit: number };
type WalletInfo = { balance: number; available: number };
type Txn = { id: string; type: string; amount: number; paymentMethod: string | null; createdAt: string };

/**
 * The accountant's read-only view of the center's books.
 *
 * Full money treatment: mono figures, end-aligned, the P&L closing on the
 * double rule. Nothing here mutates — this tier is REVOKEd at the DB layer, and
 * the UI must not imply otherwise, so there is no editable-looking amount and
 * no action anywhere on the screen.
 */
export function CenterStaffFinanceScreen() {
  const t = useTranslations();
  const { locale, formatDate } = useFormatters();
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
      <div className="p-8 text-center text-[13px] text-[var(--ink-3)]">
        {t("centerStaff.loading")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title={t("centerStaff.can.finance")}
        subtitle={t("centerStaff.roleDesc.center_accountant")}
        actions={
          <Badge tone="info" icon={<ShieldCheck className="size-3.5" />}>
            {t("centerStaff.roleName.center_accountant")}
          </Badge>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        {/* The P&L, as an accountant reads one: each line, then the rule. */}
        <Sheet>
          <SheetHead title={t("common.netProfit")} />
          <div className="flex flex-col p-[18px]">
            <PnlLine
              label={t("common.revenue")}
              piasters={pnl?.revenue ?? 0}
              locale={locale}
            />
            <PnlLine
              label={t("common.expenses")}
              piasters={-(pnl?.expenses ?? 0)}
              locale={locale}
              tone="out"
            />
            <div className="lg-total mt-1 flex items-baseline justify-between gap-3 pt-3">
              <span className="text-[13px] font-semibold text-[var(--ink)]">
                {t("common.netProfit")}
              </span>
              <Amount
                piasters={pnl?.netProfit ?? 0}
                locale={locale}
                className="text-[22px] font-semibold text-[var(--money)]"
              />
            </div>
          </div>
        </Sheet>

        <Sheet>
          <SheetHead title={t("nav.wallet")} />
          <div className="flex flex-col p-[18px]">
            <PnlLine
              label={t("nav.wallet")}
              piasters={wallet?.balance ?? 0}
              locale={locale}
            />
            <div className="lg-total mt-1 flex items-baseline justify-between gap-3 pt-3">
              <span className="text-[13px] font-semibold text-[var(--ink)]">
                {t("centerStaff.availableBalance")}
              </span>
              <Amount
                piasters={wallet?.available ?? 0}
                locale={locale}
                className="text-[17px] font-semibold text-[var(--ink)]"
              />
            </div>
          </div>
        </Sheet>
      </div>

      <Sheet>
        <SheetHead title={t("nav.transactions")} />
        {txns.length === 0 ? (
          <EmptyState title={t("shared.ledger.empty")} />
        ) : (
          <div className="lg-scroll">
          <table className="lg-table">
            <thead>
              <tr>
                <th scope="col">{t("centerStaff.txnType")}</th>
                <th scope="col">{t("centerStaff.txnDate")}</th>
                <th scope="col" data-numeric="true">
                  {t("centerStaff.txnAmount")}
                </th>
              </tr>
            </thead>
            <tbody>
              {txns.map((tx) => (
                <tr key={tx.id}>
                  <td>
                    <span className="flex items-center gap-2">
                      <Badge tone="neutral">{tx.type}</Badge>
                      {tx.paymentMethod ? (
                        <span className="text-xs text-[var(--ink-3)]">{tx.paymentMethod}</span>
                      ) : null}
                    </span>
                  </td>
                  <td>
                    <DateText className="text-xs text-[var(--ink-3)]">
                      {formatDate(tx.createdAt, { day: "numeric", month: "short", year: "numeric" })}
                    </DateText>
                  </td>
                  <td data-numeric="true">
                    <Amount
                      piasters={tx.amount}
                      locale={locale}
                      className="text-[13px] font-semibold text-[var(--ink)]"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function PnlLine({
  label,
  piasters,
  locale,
  tone,
}: {
  label: string;
  piasters: number;
  locale: string;
  tone?: "out";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--rule-2)] py-3.5 first:pt-0">
      <span className="text-[13px] text-[var(--ink-2)]">{label}</span>
      <Amount
        piasters={piasters}
        locale={locale}
        className={`text-[15px] ${tone === "out" ? "text-[var(--red)]" : "text-[var(--ink)]"}`}
      />
    </div>
  );
}
