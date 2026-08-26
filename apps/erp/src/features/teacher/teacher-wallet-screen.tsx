"use client";

import { useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { BanknoteArrowDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { TwoStepCommit } from "@repo/ui/components/confirm-dialog";
import { toast } from "@repo/ui/components/sonner";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner } from "@/components/kit/spinner";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import {
  Eyebrow,
  Hairline,
  LedgerEmpty,
  Money,
  SectionHeading,
  Sheet,
} from "@/components/ledger";
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { asArray } from "@/lib/refine/as-array";

const PAYOUT_TONE: Record<string, StatusTone> = {
  paid: "success",
  rejected: "danger",
  pending: "warning",
  approved: "neutral",
};

/** How many transactions the page shows before "شوف الكل". */
const PAGE = 20;

type Payout = {
  id: string;
  netPayable?: number;
  status: string;
  createdAt: string;
  paidAt?: string | null;
  rejectionReason?: string | null;
};

type Transaction = {
  id: string;
  refNumber?: string;
  type: string;
  amount: number;
  createdAt: string;
};

export function TeacherWalletScreen() {
  const t = useTranslations();
  const { formatEGP, formatDate } = useFormatters();

  const [take, setTake] = useState(PAGE);

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
    config: { query: { take } },
  });
  const { mutateAsync: request, mutation } = useCustomMutation();

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [amountEgp, setAmountEgp] = useState("");

  const w = wallet?.data as
    | { balance: number; available: number; pendingPayouts: { count: number; amount: number } }
    | undefined;
  const payouts = asArray<Payout>(payoutsRes?.data);
  // The transactions endpoint answers `{ data: [...] }`; asArray unwraps that
  // envelope as well, so both reads go through the same guard.
  const transactions = asArray<Transaction>(txRes?.data);

  const available = w?.available ?? 0;
  const requestedEgp = amountEgp.trim() === "" ? null : Number(amountEgp);
  const requestedValid =
    requestedEgp === null || (Number.isFinite(requestedEgp) && requestedEgp > 0);
  /** What the button is about to move — the whole available balance by default. */
  const committing = requestedEgp === null ? available : Math.round(requestedEgp * 100);

  const submitWithdraw = async () => {
    if (!requestedValid) {
      toast.error(t("teacher.teacherWallet.invalidAmount"));
      return;
    }
    try {
      await request({
        url: "teacher/wallet/payout-request",
        method: "post",
        values: requestedEgp === null ? {} : { amount: Math.round(requestedEgp * 100) },
      });
      toast.success(t("teacher.teacherWallet.requestSubmitted"));
      setWithdrawOpen(false);
      setAmountEgp("");
      walletQuery.refetch();
      payoutsQuery.refetch();
    } catch (err: any) {
      toast.error(err?.message || t("teacher.teacherWallet.requestFailed"));
    }
  };

  if (walletQuery.isLoading) return <PageSpinner label={t("teacher.teacherWallet.loading")} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("nav.wallet")}
        description={t("teacher.teacherWallet.description")}
      />

      {/* ── THE BALANCE, AND WHAT IT IS ACTUALLY MADE OF ────────────────────
          Three StatCards said "balance", "available" and "reserved" side by
          side as if they were three facts. They are one fact and its
          arithmetic: available = balance − what open requests already hold.
          A teacher who reads a balance they cannot withdraw, with no line
          saying why, opens a support ticket. Every other wallet in the product
          shows its balance as a ledger sheet with that derivation on screen;
          this one — the only wallet holding a teacher's earnings — did not. */}
      <Sheet className="p-5">
        <Eyebrow>{t("teacher.teacherWallet.balance")}</Eyebrow>
        <div className="mt-1" style={{ fontSize: 34 }}>
          <Money piasters={w?.balance ?? 0} tone="ink" weight={600} decimals />
        </div>

        <Hairline className="my-3" />

        <div className="flex items-baseline justify-between gap-4 py-1">
          <span className="text-[13px] text-ink-2">
            {t("teacher.teacherWallet.pending")}
          </span>
          <Money piasters={w?.pendingPayouts.amount ?? 0} tone="muted" decimals />
        </div>
        <div className="flex items-baseline justify-between gap-4 py-1">
          <span className="text-[13px] font-medium text-ink">
            {t("teacher.teacherWallet.available")}
          </span>
          <Money piasters={available} tone="ink" weight={600} decimals />
        </div>

        <p className="mt-2 text-xs text-ink-3">
          {w && w.pendingPayouts.count > 0
            ? t("teacher.teacherWallet.availableLineage", {
                n: w.pendingPayouts.count,
              })
            : t("teacher.teacherWallet.availableLineageNone")}
        </p>

        <div className="mt-4">
          <Button onClick={() => setWithdrawOpen(true)} disabled={available <= 0}>
            <BanknoteArrowDown className="size-4" />
            {t("teacher.teacherWallet.withdraw")}
          </Button>
          {available <= 0 ? (
            <p className="mt-1 text-xs text-ink-3">
              {t("teacher.teacherWallet.nothingAvailable")}
            </p>
          ) : null}
        </div>
      </Sheet>

      {/* ── PAYOUT REQUESTS ─────────────────────────────────────────────────
          Rows, not a five-column table on a 375px phone. The status was
          rendering the RAW enum — "pending", "approved", "paid" — English
          words inside an Arabic sentence, on the screen a teacher reads to
          find out where their money is. `status.*` already had all four. */}
      <Sheet className="p-5">
        <SectionHeading title={t("teacher.teacherWallet.payoutRequests")} />
        <div className="mt-2">
          {payoutsQuery.isLoading ? (
            <PageSpinner label={t("teacher.teacherWallet.loading")} />
          ) : payouts.length === 0 ? (
            <LedgerEmpty title={t("teacher.teacherWallet.noPayouts")} />
          ) : (
            <ul>
              {payouts.map((p, i) => (
                <li key={p.id}>
                  {i > 0 ? <Hairline /> : null}
                  <div className="flex items-start justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">
                        <Money piasters={p.netPayable ?? 0} tone="ink" weight={600} decimals />
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-3">
                        {t("teacher.teacherWallet.requestedAt")}:{" "}
                        {formatDate(p.createdAt)}
                        {p.paidAt
                          ? ` · ${t("teacher.teacherWallet.paidAt")}: ${formatDate(p.paidAt)}`
                          : ""}
                      </span>
                      {p.rejectionReason ? (
                        <span className="mt-0.5 block text-xs text-red">
                          {p.rejectionReason}
                        </span>
                      ) : null}
                    </span>
                    <StatusBadge tone={PAYOUT_TONE[p.status] ?? "neutral"}>
                      {t(asKey("status." + p.status))}
                    </StatusBadge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>

      {/* ── WHERE THE BALANCE CAME FROM ─────────────────────────────────────
          `type` was also rendering raw ("payment", "payout", "commission"),
          and the amounts carried no sign, so a payout and a lesson's earnings
          looked identical. `Money signed` is what every other ledger in the
          product uses. */}
      <Sheet className="p-5">
        <SectionHeading title={t("teacher.teacherWallet.recentTransactions")} />
        <div className="mt-2">
          {txQuery.isLoading && transactions.length === 0 ? (
            <PageSpinner label={t("teacher.teacherWallet.loading")} />
          ) : transactions.length === 0 ? (
            <LedgerEmpty title={t("teacher.teacherWallet.noTransactions")} />
          ) : (
            <>
              <ul>
                {transactions.map((x, i) => (
                  <li key={x.id}>
                    {i > 0 ? <Hairline /> : null}
                    <div className="flex items-start justify-between gap-3 py-3">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink">
                          {t(asKey(`teacher.teacherWallet.txType.${x.type}`))}
                        </span>
                        <span
                          className="mt-0.5 block font-mono text-xs text-ink-3"
                          dir="ltr"
                        >
                          {x.refNumber}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-3">
                          {formatDate(x.createdAt)}
                        </span>
                      </span>
                      <Money piasters={x.amount} signed decimals />
                    </div>
                  </li>
                ))}
              </ul>

              {/* The endpoint is cursor-paginated and the screen asked for
                  twenty with no way to ask for more — a dead end on the record
                  that explains the balance above it. */}
              {transactions.length >= take ? (
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={txQuery.isFetching}
                    onClick={() => setTake((n) => n + PAGE)}
                  >
                    {t("teacher.teacherWallet.showMore")}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </Sheet>

      <Dialog
        open={withdrawOpen}
        onOpenChange={(open) => {
          setWithdrawOpen(open);
          if (!open) setAmountEgp("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("teacher.teacherWallet.withdraw")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("teacher.teacherWallet.availableNow")}:{" "}
              <strong>{formatEGP(available, { decimals: true })}</strong>
            </p>
            <div>
              <div className="mb-1 text-sm font-medium">
                {t("teacher.teacherWallet.amountEgp")}
              </div>
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder={t("teacher.teacherWallet.fullBalancePlaceholder")}
                value={amountEgp}
                onChange={(e) => setAmountEgp(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("teacher.teacherWallet.emptyMeansAll")}
              </p>
              {!requestedValid ? (
                <p className="mt-1 text-xs text-destructive">
                  {t("teacher.teacherWallet.invalidAmount")}
                </p>
              ) : null}
            </div>

            {/* THE CEREMONY THIS SCREEN WAS MISSING.
                Requesting a payout is the only money WRITE a teacher has, and
                it was one press of an ordinary dialog button — while the
                counter's cash, the centre's withdrawal and the lesson
                settlement all arm before they commit. The repo's own rule is
                that a money commit takes two presses and the button names its
                amount. It is not friction to optimise away: there is no
                cancel endpoint for a payout request (flagged as T-4), so the
                mistake this prevents has no undo. */}
            <TwoStepCommit
              resetKey={`${committing}`}
              busy={mutation.isPending}
              onCommit={submitWithdraw}
              disabled={!requestedValid || available <= 0}
              labels={{
                /* ONE FORMATTER FOR THE FIGURE AND FOR THE BUTTON.
                   `.toFixed(2)` produced "2365.50" beside a balance rendered
                   "2,366 ج.م" — two spellings of one number on a money
                   surface, which is the exact lie the settlement decision was
                   written to end. Both now go through `formatEGP`. */
                action: t("teacher.teacherWallet.withdrawAction", {
                  amount: formatEGP(committing, { decimals: true }),
                }),
                confirm: t("teacher.teacherWallet.withdrawConfirm"),
                hint: t("teacher.teacherWallet.withdrawHint"),
                armedHint: t("teacher.teacherWallet.withdrawArmedHint"),
                armedAnnouncement: t("teacher.teacherWallet.withdrawConfirm"),
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
