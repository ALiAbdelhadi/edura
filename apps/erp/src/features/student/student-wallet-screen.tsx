"use client";

import { useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { Plus, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { QuerySection } from "@repo/ui/components/query-section";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { toast } from "@repo/ui/components/sonner";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { newIdempotencyKey } from "@/features/student/idempotency";
import { goToCheckout } from "@/lib/payments/checkout-redirect";
import { useOnlineCheckout } from "@/lib/payments/use-online-checkout";
import { StudentReceiptsSection } from "@/features/student/student-receipts-section";
import {
  Chip,
  DateText,
  DoubleTotal,
  Eyebrow,
  Hairline,
  LedgerButton,
  LedgerEmpty,
  LedgerTable,
  Money,
  Num,
  PageTitle,
  Sheet,
  Td,
  Th,
  Tr,
} from "@/features/student/ledger";
import { asArray } from "@/lib/refine/as-array";

const HISTORY_LIMIT = 100;

const VISIBLE_ROWS = 15;

type WalletInfo = { balance: number; currency: string; minTopup: number; maxTopup: number };
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

const TYPE_TONE: Record<Entry["type"], "teal" | "amber" | "neutral"> = {
  topup: "teal",
  refund: "teal",
  payment: "amber",
  adjustment: "neutral",
};

export function StudentWalletScreen() {
  const t = useTranslations();
  const { formatEGP, formatDate } = useFormatters();

  const { query: walletQuery, result: walletRes } = useCustom({ url: "me/wallet", method: "get" });
  const { query: histQuery, result: histRes } = useCustom({
    url: "me/wallet/history",
    method: "get",
    config: { query: { take: HISTORY_LIMIT } },
  });
  const { mutateAsync: mutate } = useCustomMutation();

  const wallet = (walletRes?.data as WalletInfo | undefined) ?? null;
  const entries = asArray<Entry>(histRes?.data);

  const [tab, setTab] = useState<"history" | "receipts">("history");
  const [showAll, setShowAll] = useState(false);
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
          idempotencyKey: newIdempotencyKey("wtop"),
        },
      });
      const envelope = res as { data?: { data?: unknown } | unknown };
      const raw =
        (envelope?.data as { data?: unknown } | undefined)?.data ?? (envelope?.data as unknown);
      const intent = raw as { id: string; amount: number; checkout?: { url?: string } } | undefined;
      if (intent?.checkout?.url?.includes("mock-checkout")) {
        setMockIntent({ intentId: intent.id, amount: intent.amount });
      } else if (intent?.checkout?.url) {
        goToCheckout(intent.checkout.url);
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

  const hasBalance = typeof wallet?.balance === "number";
  const latest = entries[0];
  const mismatch = hasBalance && latest !== undefined && latest.balanceAfter !== wallet!.balance;
  const shown = showAll ? entries : entries.slice(0, VISIBLE_ROWS);

  const parsedTopup = Number(amountEgp);
  const topupValid = Number.isFinite(parsedTopup) && parsedTopup > 0;

  return (
    <div className="space-y-6">
      <PageTitle
        title={t("nav.wallet")}
        subtitle={t("studentWallet.subtitle")}
        actions={
          onlineCheckout ? (
            <LedgerButton variant="primary" onClick={() => setTopupOpen(true)}>
              <Plus className="size-4" aria-hidden />
              {t("studentWallet.topUp")}
            </LedgerButton>
          ) : null
        }
      />

      <Sheet blocking={mismatch} className="p-5">
        <Eyebrow>{t("studentWallet.balance")}</Eyebrow>
        <div className="mt-1" style={{ fontSize: 34 }}>
          {hasBalance ? (
            <Money piasters={wallet!.balance} tone="ink" weight={600} />
          ) : (
            <Num style={{ color: "var(--ink-3)" }}>{t("studentWallet.balanceUnknown")}</Num>
          )}
        </div>

        {hasBalance ? (
          latest ? (
            <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
              {t("studentWallet.derivedFrom", {
                type: t(`studentWallet.type_${latest.type}`),
                date: formatDate(latest.createdAt),
              })}
            </p>
          ) : (
            <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
              {t("studentWallet.noLineageYet")}
            </p>
          )
        ) : null}

        {mismatch ? (
          <p
            className="mt-3 flex items-start gap-2 text-xs font-semibold"
            style={{ color: "var(--red)" }}
          >
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t("studentWallet.reconcileMismatch")}
          </p>
        ) : null}
      </Sheet>

      <Sheet className="p-5">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "history" | "receipts")}>
          <TabsList>
            <TabsTrigger value="history">{t("studentWallet.tabHistory")}</TabsTrigger>
            <TabsTrigger value="receipts">{t("studentWallet.tabReceipts")}</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-4">
          {tab === "receipts" ? (
            <StudentReceiptsSection embedded />
          ) : (
          <QuerySection
            query={histQuery}
            skeleton={<PageSpinner />}
            isEmpty={entries.length === 0}
            empty={<LedgerEmpty title={t("studentWallet.noHistory")} />}
          >
            <div className="space-y-3">
              <ul className="sm:hidden">
                {shown.map((e, i) => (
                  <li key={e.id}>
                    {i > 0 ? <Hairline /> : null}
                    <div className="flex items-start justify-between gap-3 py-3">
                      <div className="flex min-w-0 flex-col items-start gap-1">
                        <Chip tone={TYPE_TONE[e.type]}>{t(`studentWallet.type_${e.type}`)}</Chip>
                        <DateText style={{ color: "var(--ink-2)", fontSize: 12 }}>
                          {formatDate(e.createdAt)}
                        </DateText>
                        {e.reason ? (
                          <p className="text-xs leading-snug" style={{ color: "var(--ink-3)" }}>
                            {e.reason}
                          </p>
                        ) : null}
                        {e.refNumber ? (
                          <Num style={{ color: "var(--ink-3)", fontSize: 11 }}>{e.refNumber}</Num>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-end">
                        <div style={{ fontSize: 15 }}>
                          <Money piasters={e.delta} signed />
                        </div>
                        <p className="mt-0.5 text-[11px]" style={{ color: "var(--ink-3)" }}>
                          {t("studentWallet.balanceAfter")}{" "}
                          <Money piasters={e.balanceAfter} tone="muted" />
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="hidden sm:block">
                <LedgerTable
                  head={
                    <>
                      <Th>{t("studentWallet.colDate")}</Th>
                      <Th>{t("studentWallet.colType")}</Th>
                      <th scope="col" className="hidden px-3.5 text-start md:table-cell">
                        <span className="sr-only">{t("studentWallet.colRef")}</span>
                      </th>
                      <Th align="end">{t("studentWallet.colAmount")}</Th>
                      <Th align="end">{t("studentWallet.colBalance")}</Th>
                    </>
                  }
                >
                  {shown.map((e) => (
                    <Tr key={e.id}>
                      <Td className="whitespace-nowrap">
                        <DateText style={{ color: "var(--ink-2)", fontSize: 12 }}>
                          {formatDate(e.createdAt)}
                        </DateText>
                      </Td>
                      <Td>
                        <div className="space-y-1">
                          <Chip tone={TYPE_TONE[e.type]}>{t(`studentWallet.type_${e.type}`)}</Chip>
                          {e.reason ? (
                            <p
                              className="max-w-[20ch] text-xs leading-snug"
                              style={{ color: "var(--ink-3)" }}
                            >
                              {e.reason}
                            </p>
                          ) : null}
                        </div>
                      </Td>
                      <td className="hidden whitespace-nowrap px-3.5 py-3 md:table-cell">
                        {e.refNumber ? (
                          <Num style={{ color: "var(--ink-3)", fontSize: 11 }}>{e.refNumber}</Num>
                        ) : (
                          <span style={{ color: "var(--ink-3)" }}>—</span>
                        )}
                      </td>
                      <Td align="end">
                        <Money piasters={e.delta} signed />
                      </Td>
                      <Td align="end">
                        <Money piasters={e.balanceAfter} tone="ink" weight={600} />
                      </Td>
                    </Tr>
                  ))}
                </LedgerTable>
              </div>

              {latest ? (
                <DoubleTotal label={t("studentWallet.closingBalance")}>
                  <span style={{ fontSize: 17 }}>
                    <Money piasters={latest.balanceAfter} tone="ink" weight={600} />
                  </span>
                </DoubleTotal>
              ) : null}

              {entries.length > VISIBLE_ROWS ? (
                <LedgerButton onClick={() => setShowAll((v) => !v)}>
                  {showAll
                    ? t("studentWallet.showFewer")
                    : t("studentWallet.showAll", { count: entries.length })}
                </LedgerButton>
              ) : null}

              {entries.length >= HISTORY_LIMIT ? (
                <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                  {t("studentWallet.historyCapped", { count: entries.length })}
                </p>
              ) : null}
            </div>
          </QuerySection>
          )}
        </div>
      </Sheet>

      <Dialog open={topupOpen} onOpenChange={(o) => !busy && setTopupOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("studentWallet.topUp")}</DialogTitle>
          </DialogHeader>

          {mockIntent ? (
            <div className="space-y-4">
              <Chip tone="amber">{t("studentWallet.testMode")}</Chip>
              <p className="text-sm text-muted-foreground">
                {t("studentWallet.mockPrompt", { amount: formatEGP(mockIntent.amount) })}
              </p>
              <div className="flex gap-2">
                <LedgerButton
                  variant="primary"
                  onClick={() => completeMock("success")}
                  disabled={busy}
                >
                  {busy ? <Spinner /> : null}
                  {t("studentWallet.mockPay")}
                </LedgerButton>
                <LedgerButton onClick={() => completeMock("failure")} disabled={busy}>
                  {t("studentWallet.mockFail")}
                </LedgerButton>
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
                <LedgerButton onClick={() => setTopupOpen(false)} disabled={busy}>
                  {t("actions.cancel")}
                </LedgerButton>
                <LedgerButton variant="primary" onClick={startTopup} disabled={busy || !topupValid}>
                  {busy ? <Spinner /> : null}
                  {topupValid
                    ? t("studentWallet.topUpAction", {
                        amount: formatEGP(Math.round(parsedTopup * 100)),
                      })
                    : t("studentWallet.continue")}
                </LedgerButton>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
