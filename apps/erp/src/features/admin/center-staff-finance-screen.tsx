"use client";

import { api } from "@/lib/api/client";
import { DateRangeField, EMPTY_RANGE, type DateKeyRange } from "@/components/kit/date-range-field";
import { ReceiptLink } from "@/features/receipts/receipt-link";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useEffect, useMemo, useState } from "react";
import { Amount, Badge, DateText, EmptyState, Eyebrow, Num, PageHead, Sheet, SheetHead } from "./ledger";
import { ReportExportMenu } from "./report-export-menu";
import { takingsOf } from "./takings";

type NetProfit = { revenue: number; expenses: number; netProfit: number };
type WalletInfo = { balance: number; available: number };
type Txn = { id: string; type: string; amount: number; paymentMethod: string | null; createdAt: string };
type PaymentRow = {
  id: string;
  amount: number;
  paidAt: string;
  receiptNumber: string | null;
  studentName?: string | null;
  courseName?: string | null;
};

/**
 * The accountant's read-only view of the center's books.
 *
 * Full money treatment: mono figures, end-aligned, the P&L closing on the
 * double rule. Nothing here mutates — this tier is REVOKEd at the DB layer, and
 * the UI must not imply otherwise, so there is no editable-looking amount and
 * no action anywhere on the screen.
 *
 * ── WHAT THIS TIER COULD ALREADY READ AND WAS NEVER SHOWN ──────────────────
 *
 * `center-actor.ts` opens `payments`, `payments/[id]/receipt` and the five
 * money reports to `center_accountant`, and the export route admits the tier
 * explicitly. The screen read none of them: no period control on the ONE screen
 * in the product whose whole job is closing a month, no list of the receipts
 * the P&L is made of, and no export — while the accountant's own guided tour
 * already had an `exports` step pointing here. Three capabilities the tier held
 * and could not reach.
 *
 * Everything added is a READ the allow-list already grants. No route, no
 * service and no permission changed.
 */
export function CenterStaffFinanceScreen() {
  const t = useTranslations();
  const { locale, formatDate } = useFormatters();
  const [pnl, setPnl] = useState<NetProfit | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [ready, setReady] = useState(false);

  /*
    THE PERIOD. An accountant closes a month; this screen used to show one
    lifetime figure and no way to bound it.

    Day keys go to the server as-is and are resolved there by `dayRange` —
    Cairo day, `to` inclusive (docs/decisions/money-day-boundary.md). The P&L
    and the receipt list below it therefore bound the period in ONE place,
    which is the defect that module was written to end.
  */
  const [range, setRange] = useState<DateKeyRange>(EMPTY_RANGE);
  const rangeQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (range.from) p.set("from", range.from);
    if (range.to) p.set("to", range.to);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [range]);

  // The wallet and its ledger are BALANCES, not period figures — the wallet
  // holds what it holds today whatever range is picked, and
  // `center/wallet/transactions` takes no date filter at all. So they load once
  // and are deliberately left out of the range effect below; re-fetching them
  // on every date change would imply a narrowing that does not happen.
  useEffect(() => {
    Promise.all([
      api.get("center/wallet").json<{ data: WalletInfo }>().then((r) => setWallet(r.data)).catch(() => {}),
      api
        .get("center/wallet/transactions")
        .json<{ data: { data: Txn[] } }>()
        .then((r) => setTxns(r.data.data ?? []))
        .catch(() => {}),
    ]).finally(() => setReady(true));
  }, []);

  // The two reads the period DOES bound, re-run together so the statement and
  // the receipts under it can never describe different windows.
  useEffect(() => {
    void Promise.all([
      api
        .get(`reports/net-profit${rangeQuery}`)
        .json<{ data: NetProfit }>()
        .then((r) => setPnl(r.data))
        .catch(() => {}),
      api
        .get(`payments${rangeQuery}`)
        .json<{ data: PaymentRow[] }>()
        .then((r) => setPayments(Array.isArray(r.data) ? r.data : []))
        .catch(() => setPayments([])),
    ]);
  }, [rangeQuery]);

  const takings = takingsOf(payments);

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
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeField
              value={range}
              onChange={setRange}
              formatDate={formatDate}
              placeholder={t("adminManage.reports.pickDateRange")}
              clearLabel={t("adminManage.fees.reset")}
            />
            {/* Money reports only. The other three in the registry are the
                manager's tier and would 403 for every reader of this page. */}
            <ReportExportMenu from={range.from} to={range.to} only="money" />
            <Badge tone="info" icon={<ShieldCheck className="size-3.5" />}>
              {t("centerStaff.roleName.center_accountant")}
            </Badge>
          </div>
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
              {/*
                A LOSS IS NOT TEAL. The closing figure was `--money`
                unconditionally, so a month that lost money announced it in the
                colour this design system reserves for value arriving — the
                screenshot that caught it read «صافي الربح −18,000.01» in teal.
                Harmless while the screen showed one lifetime total that
                happened to be positive; not harmless now that a period can be
                picked, which is what this step added. The expenses line above
                has always been red for exactly this reason.
              */}
              <Amount
                piasters={pnl?.netProfit ?? 0}
                locale={locale}
                className={`text-[22px] font-semibold ${
                  (pnl?.netProfit ?? 0) < 0 ? "text-[var(--red)]" : "text-[var(--money)]"
                }`}
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

      {/*
        THE RECEIPTS THE STATEMENT IS MADE OF — between the P&L and the wallet
        ledger, because that is the order an accountant checks in: the totals,
        then the rows behind them, then the balance that resulted.

        `payments` GET has always been in this tier's allow-list and this screen
        never called it, so the person whose job is reconciling could see a net
        figure and none of its parts.

        NO ACTION ANYWHERE. The owner's copy of this log carries a refund
        control and two record-money buttons; this tier is REVOKEd at the DB
        layer and the screen must not imply otherwise. Opening a receipt is a
        READ (`payments/[id]/receipt`, also allow-listed) and is the one thing
        offered.
      */}
      <Sheet>
        <SheetHead title={t("adminManage.fees.paymentLog")} />

        <div className="flex flex-wrap items-start gap-x-8 gap-y-4 border-b border-[var(--rule)] p-[18px]">
          <div className="min-w-[150px]">
            <Eyebrow>{t("adminHome.takings_net")}</Eyebrow>
            <p className="mt-1.5 mb-0">
              <Amount
                piasters={takings.net}
                locale={locale}
                className="text-[22px] font-semibold text-[var(--money)]"
              />
            </p>
            <p className="mt-1 mb-0 text-[12px] text-[var(--ink-3)]">
              {t("adminHome.takings_receipts", { n: takings.receipts })}
            </p>
          </div>
          {takings.refunds > 0 ? (
            <>
              <div aria-hidden className="hidden h-[46px] w-px bg-[var(--rule)] sm:block" />
              <div className="min-w-[130px]">
                <Eyebrow>{t("adminHome.takings_refunded")}</Eyebrow>
                <p className="mt-1.5 mb-0">
                  <Amount
                    piasters={-takings.refunded}
                    locale={locale}
                    className="text-[17px] font-semibold text-[var(--red)]"
                  />
                </p>
                <p className="mt-1 mb-0 text-[12px] text-[var(--ink-3)]">
                  {t("adminHome.takings_refundCount", { n: takings.refunds })}
                </p>
              </div>
            </>
          ) : null}
        </div>

        {payments.length === 0 ? (
          <EmptyState title={t("centerStaff.noPaymentsInPeriod")} />
        ) : (
          <div className="lg-scroll">
            <table className="lg-table">
              <thead>
                <tr>
                  <th scope="col">{t("adminManage.fees.date")}</th>
                  <th scope="col">{t("adminManage.fees.student")}</th>
                  <th scope="col">{t("adminManage.fees.course")}</th>
                  <th scope="col">{t("adminManage.fees.receiptNumber")}</th>
                  <th scope="col" data-numeric="true">
                    {t("adminManage.fees.amount")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <DateText className="text-xs text-[var(--ink-3)]">
                        {formatDate(p.paidAt, { day: "numeric", month: "short", year: "numeric" })}
                      </DateText>
                    </td>
                    {/* Plain text, not a link to the student record: the roster
                        routes are the receptionist's tier, so a link here would
                        walk this reader into a 403. */}
                    <td>
                      <span className="text-[13px] text-[var(--ink)]">{p.studentName || "—"}</span>
                    </td>
                    <td>
                      <span className="text-[13px] text-[var(--ink-2)]">{p.courseName || "—"}</span>
                    </td>
                    <td>
                      <span className="flex items-center gap-2">
                        <Num className="text-xs text-[var(--ink-3)]">{p.receiptNumber || "—"}</Num>
                        <ReceiptLink paymentId={p.id} />
                      </span>
                    </td>
                    <td data-numeric="true">
                      <Amount
                        piasters={p.amount}
                        locale={locale}
                        className={`text-[13px] font-semibold ${
                          p.amount < 0 ? "text-[var(--red)]" : "text-[var(--ink)]"
                        }`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Same disclosure the owner's home carries. The method is stored on
            the ledger and the subscription but NOT on the receipt, so no screen
            can break this down by cash / online / wallet — see takings.ts and
            EDURA_IMPROVEMENT_REPORT MC-3. Delete this line when MC-3 lands. */}
        <p className="m-0 border-t border-[var(--rule-2)] px-[18px] py-2 text-[11px] text-[var(--ink-3)]">
          {t("adminHome.takings_methodNote")}
        </p>
      </Sheet>

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
        className={`text-[15px] ${tone === "out" ? "text-destructive" : "text-[var(--ink)]"}`}
      />
    </div>
  );
}
