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
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { toast } from "@repo/ui/components/sonner";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { newIdempotencyKey } from "@/features/student/idempotency";
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

/** How many ledger entries we ask for. The endpoint hard-caps at 200. */
const HISTORY_LIMIT = 100;

/**
 * How many are PAINTED before the reader asks for more.
 *
 * Separate from `HISTORY_LIMIT` on purpose: the window is about reading, the
 * limit is about fetching. Everything fetched is already on the client, so
 * "شوف الكل" costs no request — it only stops a phone opening on ninety rows
 * of history when the question was "كام عندي".
 */
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

/**
 * The student wallet, under the full ledger treatment.
 *
 * The balance is not a stored number the app happens to know — it is presented
 * as the closing balance of a specific entry, with that entry reachable
 * directly below it. A figure the student cannot trace is a figure they must
 * trust blindly.
 *
 * `me/wallet` returns the CACHED `walletBalance` column while the newest ledger
 * row carries the derived truth in `balanceAfter`. Those two agreeing is the
 * invariant; when they disagree we say so rather than silently showing the
 * cache. A student's money carries the same guarantees as anyone else's, and
 * the interface must not imply otherwise because the user is young.
 *
 * ── WHAT THE IA PASS CHANGED, AND WHAT IT DID NOT ─────────────────────────
 *
 * NOT changed: the balance, its lineage line, the mismatch warning, the
 * closing-balance rule, the top-up flow, or anything either of them reads.
 *
 * 1. THE FIGURES WERE FALLING OFF THE PHONE. The history was one five-column
 *    `LedgerTable` at every width. Measured at 375px: the header showed only
 *    التاريخ and النوع, the amount column was clipped mid-glyph, and the
 *    running balance was off the sheet entirely — the two numbers the page
 *    exists for. (The file already carried a comment saying "the money must
 *    never be what scrolls off a 390px screen"; it was.) A phone now gets rows
 *    and `sm` upward keeps the table, which is this product's money idiom.
 *    Rows also have room for the reference number, which the table hides below
 *    `sm`.
 * 2. THE RECEIPTS WERE BURIED. They sat in their own sheet BENEATH a table of
 *    up to a hundred entries — roughly four thousand pixels down a phone — and
 *    a receipt is the thing a parent asks a student to produce. They are now
 *    the second tab, one tap under the balance.
 *
 *    History stays the DEFAULT tab, deliberately: the balance above is stated
 *    as the closing figure of the newest entry, and the entry that proves it
 *    has to be the thing directly beneath it. Receipts move within reach
 *    without breaking that adjacency.
 * 3. THE HISTORY OPENS WINDOWED. Fifteen rows, then "شوف الكل". Nothing is
 *    refetched — see `VISIBLE_ROWS`.
 *
 * STILL PENDING the shared layer: two-step commit on pay-from-wallet, which
 * needs the foundation's ConfirmDialog. The top-up action already carries its
 * own amount — the half that needed no shared component.
 */
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

  // `?? 0` would render "0.00 EGP" for an unknown balance — a false statement
  // about someone's money, not a neutral default.
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
          <LedgerButton variant="primary" onClick={() => setTopupOpen(true)}>
            <Plus className="size-4" aria-hidden />
            {t("studentWallet.topUp")}
          </LedgerButton>
        }
      />

      {/* Balance, stated as a consequence of the entries below it. */}
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
            /* Its own list, never merged into the one above — a card or cash
               payment never touched the wallet, and the ledger's rows have to
               sum to the closing balance. See the component's header. */
            <StudentReceiptsSection embedded />
          ) : histQuery.isLoading ? (
            <PageSpinner />
          ) : entries.length === 0 ? (
            <LedgerEmpty title={t("studentWallet.noHistory")} />
          ) : (
            <div className="space-y-3">
              {/* ── Phone: rows ─────────────────────────────────────────────
                  Measured at 375px, the table below clipped the amount and
                  pushed the running balance off the sheet entirely. */}
              <ul className="sm:hidden">
                {shown.map((e, i) => (
                  <li key={e.id}>
                    {i > 0 ? <Hairline /> : null}
                    <div className="flex items-start justify-between gap-3 py-3">
                      {/* `flex flex-col`, NOT `space-y-*`: `Chip` and `Num` are
                          both inline spans, so a vertical-space utility does
                          nothing to them — they flowed onto one line and the
                          reference number wrapped mid-token ("PM-20 / 100000").
                          A column with a gap stacks inline children. */}
                      <div className="flex min-w-0 flex-col items-start gap-1">
                        <Chip tone={TYPE_TONE[e.type]}>{t(`studentWallet.type_${e.type}`)}</Chip>
                        {/* `DateText`, not `<Num>` — see its own doc: a month
                            name is a word, and the figure isolate reorders it. */}
                        <DateText style={{ color: "var(--ink-2)", fontSize: 12 }}>
                          {formatDate(e.createdAt)}
                        </DateText>
                        {/* An adjustment with no stated reason is a bug, not a row. */}
                        {e.reason ? (
                          <p className="text-xs leading-snug" style={{ color: "var(--ink-3)" }}>
                            {e.reason}
                          </p>
                        ) : null}
                        {/* The reference has room here that it never had in the
                            table, where it is the column that yields below `sm`. */}
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

              {/* ── From `sm`: the accountant's table. */}
              <div className="hidden sm:block">
                <LedgerTable
                  head={
                    <>
                      <Th>{t("studentWallet.colDate")}</Th>
                      <Th>{t("studentWallet.colType")}</Th>
                      {/* The reference is the least load-bearing column, so it
                          is the one that yields first. */}
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
                        {/* `DateText`, not `<Num>` — see its own doc: a month
                            name is a word, and the figure isolate reorders it. */}
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

              {/* The window is a READING control and must never move the
                  figure. The closing balance is the newest entry's
                  `balanceAfter` — a complete figure that already accounts for
                  every row, shown or not — and NOT a sum over what happens to
                  be painted, which would change as the reader expanded the
                  list. */}
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

              {/* No pager: the endpoint exposes only a limit, no total count and
                  no cursor, so a "1–50 / N" control would promise navigation the
                  API cannot serve. State the window instead. */}
              {entries.length >= HISTORY_LIMIT ? (
                <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                  {t("studentWallet.historyCapped", { count: entries.length })}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </Sheet>

      {/* Top-up dialog */}
      <Dialog open={topupOpen} onOpenChange={(o) => !busy && setTopupOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("studentWallet.topUp")}</DialogTitle>
          </DialogHeader>

          {mockIntent ? (
            <div className="space-y-4">
              {/* Driven by the gateway's own response, so this cannot appear
                  against a real gateway. Labelled so it can never be mistaken
                  for a real payment step. */}
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
                {/* The action carries its own amount. */}
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
