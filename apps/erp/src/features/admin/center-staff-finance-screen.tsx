"use client";

import { api } from "@/lib/api/client";
import { DateRangeField, EMPTY_RANGE, type DateKeyRange } from "@/components/kit/date-range-field";
import { ReceiptLink } from "@/features/receipts/receipt-link";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { QuerySection, type QueryLike } from "@repo/ui/components/query-section";
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

type Load<T> = { status: "loading" | "error" } | { status: "ready"; data: T };

function asQuery(state: Load<unknown>, retry: () => void): QueryLike {
  return {
    isPending: state.status === "loading",
    isError: state.status === "error",
    refetch: retry,
  };
}

export function CenterStaffFinanceScreen() {
  const t = useTranslations();
  const { locale, formatDate } = useFormatters();
  const [pnlState, setPnlState] = useState<Load<NetProfit>>({ status: "loading" });
  const [walletState, setWalletState] = useState<Load<WalletInfo>>({ status: "loading" });
  const [txnsState, setTxnsState] = useState<Load<Txn[]>>({ status: "loading" });
  const [paymentsState, setPaymentsState] = useState<Load<PaymentRow[]>>({ status: "loading" });
  const [staticNonce, setStaticNonce] = useState(0);
  const [rangeNonce, setRangeNonce] = useState(0);

  const [range, setRange] = useState<DateKeyRange>(EMPTY_RANGE);
  const rangeQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (range.from) p.set("from", range.from);
    if (range.to) p.set("to", range.to);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [range]);

  useEffect(() => {
    setWalletState({ status: "loading" });
    setTxnsState({ status: "loading" });
    void api
      .get("center/wallet")
      .json<{ data: WalletInfo }>()
      .then((r) => setWalletState({ status: "ready", data: r.data }))
      .catch(() => setWalletState({ status: "error" }));
    void api
      .get("center/wallet/transactions")
      .json<{ data: { data: Txn[] } }>()
      .then((r) => setTxnsState({ status: "ready", data: r.data.data ?? [] }))
      .catch(() => setTxnsState({ status: "error" }));
  }, [staticNonce]);

  useEffect(() => {
    setPnlState({ status: "loading" });
    setPaymentsState({ status: "loading" });
    void api
      .get(`reports/net-profit${rangeQuery}`)
      .json<{ data: NetProfit }>()
      .then((r) => setPnlState({ status: "ready", data: r.data }))
      .catch(() => setPnlState({ status: "error" }));
    void api
      .get(`payments${rangeQuery}`)
      .json<{ data: PaymentRow[] }>()
      .then((r) =>
        setPaymentsState({ status: "ready", data: Array.isArray(r.data) ? r.data : [] }),
      )
      .catch(() => setPaymentsState({ status: "error" }));
  }, [rangeQuery, rangeNonce]);

  const retryStatic = () => setStaticNonce((n) => n + 1);
  const retryRange = () => setRangeNonce((n) => n + 1);

  const pnl = pnlState.status === "ready" ? pnlState.data : null;
  const wallet = walletState.status === "ready" ? walletState.data : null;
  const txns = txnsState.status === "ready" ? txnsState.data : [];
  const payments = paymentsState.status === "ready" ? paymentsState.data : [];

  const takings = takingsOf(payments);

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
            <ReportExportMenu from={range.from} to={range.to} only="money" />
            <Badge tone="info" icon={<ShieldCheck className="size-3.5" />}>
              {t("centerStaff.roleName.center_accountant")}
            </Badge>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <Sheet>
          <SheetHead title={t("common.netProfit")} />
          <QuerySection query={asQuery(pnlState, retryRange)} className="m-[18px]">
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
                className={`text-[22px] font-semibold ${
                  (pnl?.netProfit ?? 0) < 0 ? "text-[var(--red)]" : "text-[var(--money)]"
                }`}
              />
            </div>
          </div>
          </QuerySection>
        </Sheet>

        <Sheet>
          <SheetHead title={t("nav.wallet")} />
          <QuerySection query={asQuery(walletState, retryStatic)} className="m-[18px]">
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
          </QuerySection>
        </Sheet>
      </div>

      <Sheet>
        <SheetHead title={t("adminManage.fees.paymentLog")} />

        <QuerySection query={asQuery(paymentsState, retryRange)} className="m-[18px]">
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

        <p className="m-0 border-t border-[var(--rule-2)] px-[18px] py-2 text-[11px] text-[var(--ink-3)]">
          {t("adminHome.takings_methodNote")}
        </p>
        </QuerySection>
      </Sheet>

      <Sheet>
        <SheetHead title={t("nav.transactions")} />
        <QuerySection
          query={asQuery(txnsState, retryStatic)}
          className="m-[18px]"
          isEmpty={txns.length === 0}
          empty={<EmptyState title={t("shared.ledger.empty")} />}
        >
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
        </QuerySection>
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
