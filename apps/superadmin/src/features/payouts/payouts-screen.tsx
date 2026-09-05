"use client";

import { useEffect, useMemo, useState } from "react";
import { useCustom } from "@refinedev/core";
import { asArray } from "@/lib/refine/as-array";
import { useLocale, useTranslations } from "next-intl";
import {
  BanknoteArrowDown,
  FileDown,
  RefreshCcw,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { IdentityCell, initialsOf } from "@repo/ui/components/identity-cell";
import { Num, ProseCount } from "@repo/ui/components/num";
import { StatusBadge, statusTone } from "@repo/ui/components/status-badge";
import { TwoStepCommit } from "@repo/ui/components/confirm-dialog";
import { Textarea } from "@repo/ui/components/textarea";
import { toast } from "@repo/ui/components/sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { api } from "@/lib/api/client";
import { useAction } from "@/lib/api/use-action";
import { cn } from "@repo/ui/lib/utils";
import type { Locale } from "@repo/ui/lib/format";

import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { ListErrorState } from "@/components/kit/list-shell";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { asKey } from "@/lib/i18n/keys";

type PayoutRow = {
  id: string;
  beneficiaryId: string;
  beneficiaryType: "teacher" | "center";
  beneficiaryName: string | null;
  beneficiaryEmail: string | null;
  netPayable: number | null;
  grossAmount: number | null;
  commission: number | null;
  lessonCount: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  walletBalance: number | null;
  covered: boolean | null;
  status: "pending" | "approved" | "paid" | "rejected";
  rejectionReason: string | null;
  createdAt: string;
  paidAt: string | null;
};

// An APPROVED payout is not a settled one — the money has not moved yet — so it
// reads as in-progress (indigo) here rather than the shared map's settled teal.
const PAYOUT_TONE = { approved: "active" } as const;

const STATUSES = ["pending", "paid", "rejected"] as const;

export function PayoutsScreen() {
  const t = useTranslations("payouts");
  const locale = useLocale() as Locale;

  const [status, setStatus] = useState<string>("pending");
  const [type, setType] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<PayoutRow[]>([]);

  const { query, result } = useCustom<PayoutRow[]>({
    url: "finance/payouts",
    method: "get",
    config: { query: { status, ...(type ? { type } : {}) } },
  });
  const { result: countsResult, query: countsQuery } = useCustom<Record<string, number>>({
    url: "finance/payouts/counts",
    method: "get",
  });

  const rows = useMemo(() => asArray<PayoutRow>(result?.data), [result?.data]);
  const counts = (countsResult?.data ?? {}) as Record<string, number>;
  const open = rows.find((r) => r.id === openId) ?? null;

  useEffect(() => {
    if (openId && !rows.some((r) => r.id === openId)) setOpenId(null);
  }, [rows, openId]);

  const refresh = () => {
    void query.refetch();
    void countsQuery.refetch();
  };

  const columns: ColumnDef<PayoutRow, unknown>[] = [
    {
      id: "beneficiary",
      header: t("colBeneficiary"),
      cell: ({ row }) => {
        const p = row.original;
        return (
          <IdentityCell
            kind={p.beneficiaryType === "center" ? "center" : "person"}
            initials={initialsOf(p.beneficiaryName ?? "—")}
            name={p.beneficiaryName ?? <Num.Code>{p.beneficiaryId.slice(0, 8)}</Num.Code>}
            meta={p.beneficiaryEmail ? <Num.Code>{p.beneficiaryEmail}</Num.Code> : undefined}
          />
        );
      },
    },
    {
      id: "gross",
      header: t("colGross"),
      cell: ({ row }) => (
        <Num.Money piasters={row.original.grossAmount} locale={locale} tone="muted" sign={false} />
      ),
    },
    {
      id: "commission",
      header: t("colCommission"),
      cell: ({ row }) => (
        <Num.Money piasters={row.original.commission} locale={locale} tone="muted" sign={false} />
      ),
    },
    {
      id: "net",
      header: t("colNet"),
      cell: ({ row }) => (
        <Num.Money piasters={row.original.netPayable} locale={locale} tone="net" sign={false} />
      ),
    },
    {
      id: "status",
      header: t("colStatus"),
      cell: ({ row }) => {
        const p = row.original;
        return (
          <StatusBadge
            tone={statusTone(p.status, PAYOUT_TONE)}
            age={
              p.status === "pending" ? (
                <Num.Date value={p.createdAt} locale={locale} />
              ) : undefined
            }
            reason={p.status === "rejected" ? p.rejectionReason : undefined}
          >
            {t(asKey(`status${p.status[0]!.toUpperCase()}${p.status.slice(1)}`))}
          </StatusBadge>
        );
      },
    },
    {
      id: "requested",
      header: t("colRequested"),
      cell: ({ row }) => <Num.Date value={row.original.createdAt} locale={locale} />,
    },
  ];

  const selectedTotal = selected.reduce((s, r) => s + (r.netPayable ?? 0), 0);

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        rule
        actions={
          <div className="flex items-center gap-2">
            <CycleStatementButton label={t("cycleStatement")} />
            <GenerateButton onDone={refresh} label={t("generate")} okMsg={t("generateOk")} />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rule bg-sheet px-4 py-3 shadow-[var(--lift)]">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStatus(s);
              setOpenId(null);
            }}
            aria-pressed={status === s}
            className={cn(
              "focus-ledger inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] transition-colors",
              status === s
                ? "border-indigo bg-indigo-soft font-semibold text-indigo"
                : "border-rule text-ink-2 hover:bg-rule-2",
            )}
          >
            {t(asKey(`status${s[0]!.toUpperCase()}${s.slice(1)}`))}
            <Num.Figure value={counts[s] ?? 0} locale={locale} className="text-[11px]" />
          </button>
        ))}

        <div aria-hidden="true" className="mx-1 h-5 w-px bg-rule" />

        <select
          value={type ?? ""}
          onChange={(e) => setType(e.target.value || null)}
          aria-label={t("beneficiaryAll")}
          className="focus-ledger h-8 rounded-lg border border-rule bg-field px-2 text-[13px] text-ink-2"
        >
          <option value="">{t("beneficiaryAll")}</option>
          <option value="teacher">{t("beneficiaryTeacher")}</option>
          <option value="center">{t("beneficiaryCenter")}</option>
        </select>

        {selected.length > 0 ? (
          <span className="ms-auto flex items-baseline gap-2 text-[13px] text-ink-2">
            {t("selectedTotal")}
            <Num.Money piasters={selectedTotal} locale={locale} tone="net" sign={false} />
          </span>
        ) : null}
      </div>

      <div className="flex items-start gap-5">
        <div className="min-w-0 flex-1">
          <DataTable<PayoutRow, unknown>
            columns={columns}
            data={rows}
            density="compact"
            selectable
            onSelectionChange={setSelected}
            onRowClick={(r) => setOpenId(r.id)}
            isLoading={query.isLoading}
            error={
              query.isError ? (
                <ListErrorState
                  denied={
                    (query.error as { statusCode?: number } | null)?.statusCode === 403
                  }
                  onRetry={refresh}
                  errorTitle={t("loadError")}
                  errorDescription={t("loadErrorBody")}
                  deniedTitle={t("deniedTitle")}
                  deniedDescription={t("deniedBody")}
                />
              ) : undefined
            }
            emptyState={
              <EmptyState
                tone="empty"
                icon={BanknoteArrowDown}
                title={t("empty")}
                description={t("emptyBody")}
              />
            }
            labels={{ selectRow: t("rowSelect") }}
          />
        </div>

        <DecisionPanel
          payout={open}
          locale={locale}
          t={t}
          onClose={() => setOpenId(null)}
          onDone={refresh}
        />
      </div>
    </div>
  );
}

function GenerateButton({
  onDone,
  label,
  okMsg,
}: {
  onDone: () => void;
  label: string;
  okMsg: string;
}) {
  const { run, busy } = useAction({
    url: "finance/payouts",
    successMsg: okMsg,
    onSuccess: () => onDone(),
  });
  return (
    <Button disabled={busy} onClick={() => void run({ values: {} })}>
      <RefreshCcw className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
}

function DecisionPanel({
  payout,
  locale,
  t,
  onClose,
  onDone,
}: {
  payout: PayoutRow | null;
  locale: Locale;
  t: ReturnType<typeof useTranslations<"payouts">>;
  onClose: () => void;
  onDone: () => void;
}) {
  // "insufficient float" and friends arrive as the API message — useAction
  // surfaces it verbatim rather than collapsing it into a generic failure.
  const { run, busy } = useAction({ onSuccess: () => onDone() });
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    setRejecting(false);
    setReason("");
  }, [payout?.id]);

  if (!payout) {
    return (
      <aside className="hidden w-[396px] shrink-0 self-stretch border-rule ps-5 lg:block lg:border-s">
        <EmptyState
          tone="empty"
          icon={BanknoteArrowDown}
          title={t("panelEmpty")}
          description={t("panelEmptyBody")}
        />
      </aside>
    );
  }

  const net = payout.netPayable ?? 0;
  const blocked = payout.covered === false;
  const actionable = payout.status === "pending";

  const approve = async () => {
    const res = await run({
      url: `finance/payouts/${payout.id}/approve`,
      values: {},
      successMsg: t("approveOk"),
    });
    if (res.ok) onClose();
  };

  const reject = async () => {
    if (!reason.trim()) {
      toast.error(t("rejectRequired"));
      return;
    }
    const res = await run({
      url: `finance/payouts/${payout.id}/reject`,
      values: { reason: reason.trim() },
      successMsg: t("rejectOk"),
    });
    if (res.ok) onClose();
  };

  return (
    <aside className="w-[396px] shrink-0 self-stretch border-rule ps-5 lg:border-s">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow locale={locale}>{t("panelEyebrow")}</Eyebrow>
          <h2 className="mt-1 truncate text-[17px] font-bold text-ink">
            {payout.beneficiaryName ?? "—"}
          </h2>
          <Num.Code className="mt-0.5 block text-[11px]">
            {payout.id.slice(0, 8).toUpperCase()}
          </Num.Code>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("panelClose")}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      </header>

      <section className="mt-4 rounded-[10px] border border-rule bg-field p-4">
        <Eyebrow locale={locale} className="mb-3">
          {t("breakdown")}
        </Eyebrow>

        <dl className="flex flex-col gap-2">
          <Line
            label={
              <>
                {t("breakdownGross")}
                {payout.lessonCount ? (
                  <>
                    {" ("}
                    <ProseCount
                      count={payout.lessonCount}
                      locale={locale}
                      forms={{
                        one: t("session_one"),
                        two: t.has(asKey("session_two")) ? t(asKey("session_two")) : undefined,
                        few: t.has(asKey("session_few")) ? t(asKey("session_few")) : undefined,
                        many: t("session_many"),
                      }}
                    />
                    {")"}
                  </>
                ) : null}
              </>
            }
          >
            <Num.Money piasters={payout.grossAmount} locale={locale} tone="muted" sign={false} />
          </Line>

          <Line label={t("breakdownCommission")}>
            <Num.Money piasters={payout.commission} locale={locale} tone="out" />
          </Line>
        </dl>

        <div className="mt-3 flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-semibold text-ink">{t("breakdownNet")}</span>
          <Num.Total
            piasters={net}
            locale={locale}
            tone="in"
            sign={false}
            className="text-[22px] text-teal"
          />
        </div>
      </section>

      {payout.periodStart && payout.periodEnd ? (
        <section className="mt-4">
          <Eyebrow locale={locale} className="mb-2">
            {t("period")}
          </Eyebrow>
          <Num.Date value={payout.periodStart} locale={locale} className="text-[13px]" />
          <span className="mx-2 text-ink-3" aria-hidden="true">
            —
          </span>
          <Num.Date value={payout.periodEnd} locale={locale} className="text-[13px]" />
        </section>
      ) : null}

      {actionable ? (
        <>
          <p
            className={cn(
              "mt-4 flex gap-2 rounded-lg p-3 text-xs",
              blocked ? "bg-red-soft text-red" : "bg-teal-soft text-teal",
            )}
          >
            {blocked ? (
              <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden="true" />
            ) : (
              <ShieldCheck className="mt-px size-4 shrink-0" aria-hidden="true" />
            )}
            {blocked ? t("clearanceBlocked") : t("clearanceOk")}
          </p>

          <p className="mt-2 flex gap-2 rounded-lg border border-red bg-red-soft p-3 text-xs text-red">
            <BanknoteArrowDown className="mt-px size-4 shrink-0" aria-hidden="true" />
            {t("lockNotice")}
          </p>

          <div className="mt-4">
            <TwoStepCommit
              resetKey={payout.id}
              disabled={blocked}
              busy={busy}
              icon={BanknoteArrowDown}
              onCommit={approve}
              labels={{
                action: (
                  <span className="inline-flex items-baseline gap-2">
                    {t("commitAction")}
                    <Num.Money piasters={net} locale={locale} sign={false} />
                  </span>
                ),
                confirm: t("commitConfirm"),
                hint: t("commitHint"),
                armedHint: t("commitArmedHint"),
                armedAnnouncement: t("commitAnnounce"),
              }}
            />
          </div>

          <div className="mt-3 flex flex-col gap-2">
            {rejecting ? (
              <div className="flex flex-col gap-2">
                <label className="text-xs text-ink-2" htmlFor="reject-reason">
                  {t("rejectTitle")}
                </label>
                <Textarea
                  id="reject-reason"
                  rows={3}
                  value={reason}
                  placeholder={t("rejectPlaceholder")}
                  onChange={(e) => setReason(e.target.value)}
                />
                <p className="text-xs text-ink-3">{t("rejectHint")}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setRejecting(false)}>
                    {t("rejectCancel")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || !reason.trim()}
                    className="border-red text-red hover:bg-red-soft"
                    onClick={reject}
                  >
                    {t("rejectSubmit")}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Button variant="outline" className="text-ink-2" disabled>
                  {t("defer")}
                </Button>
                <Button
                  variant="outline"
                  className="border-rule text-red hover:bg-red-soft"
                  onClick={() => setRejecting(true)}
                >
                  {t("rejectWithReason")}
                </Button>
              </>
            )}
          </div>
        </>
      ) : (
        <section className="mt-4 flex flex-col gap-2">
          <StatusBadge
            tone={statusTone(payout.status, PAYOUT_TONE)}
            reason={payout.status === "rejected" ? payout.rejectionReason : undefined}
          >
            {t(asKey(`status${payout.status[0]!.toUpperCase()}${payout.status.slice(1)}`))}
          </StatusBadge>

          {payout.paidAt ? (
            <p className="text-xs text-ink-2">
              {t("paidOn")} <Num.Date value={payout.paidAt} locale={locale} />
            </p>
          ) : null}

          {payout.status === "paid" ? (
            <ReceiptButton payoutId={payout.id} locale={locale} t={t} />
          ) : null}
        </section>
      )}
    </aside>
  );
}

type ReceiptData = {
  lessonCount: number;
  grossAmount: number;
  commission: number;
  netPayable: number;
  paidAt: string | null;
};

// Both of these endpoints answer with a JSON envelope, not a file — the old
// anchors opened a tab of raw JSON even on success.
function CycleStatementButton({ label }: { label: string }) {
  const tc = useTranslations("common");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    const toastId = toast.loading(tc("exportPreparing"));
    try {
      const res = await api
        .get("finance/reports/revenue")
        .json<{ data: { period: string; grossRevenue: number; platformCommission: number; payouts: number; refunds: number }[] }>();
      const egp = (n: number) => (n / 100).toFixed(2);
      const lines = [
        "period,gross_revenue_egp,platform_commission_egp,payouts_egp,refunds_egp",
        ...res.data.map((r) =>
          [r.period, egp(r.grossRevenue), egp(r.platformCommission), egp(r.payouts), egp(r.refunds)].join(","),
        ),
      ];
      const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `revenue-statement-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(tc("exportReady"), { id: toastId });
    } catch (e) {
      toast.error((e as { message?: string })?.message || tc("exportFailed"), { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" disabled={busy} onClick={() => void run()}>
      <FileDown className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
}

function ReceiptButton({
  payoutId,
  locale,
  t,
}: {
  payoutId: string;
  locale: Locale;
  t: ReturnType<typeof useTranslations<"payouts">>;
}) {
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api
        .get(`finance/payouts/${payoutId}/receipt`)
        .json<{ data: ReceiptData }>();
      setReceipt(res.data);
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("receiptLoadFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void open()}>
        <FileDown className="size-4" aria-hidden="true" />
        {t("receipt")}
      </Button>
      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("receiptTitle")}</DialogTitle>
          </DialogHeader>
          {receipt ? (
            <dl className="flex flex-col gap-2.5">
              <Line label={t("receiptLessons")}>
                <Num.Figure value={receipt.lessonCount} locale={locale} />
              </Line>
              <Line label={t("breakdownGross")}>
                <Num.Money piasters={receipt.grossAmount} locale={locale} tone="muted" sign={false} />
              </Line>
              <Line label={t("breakdownCommission")}>
                <Num.Money piasters={receipt.commission} locale={locale} tone="muted" sign={false} />
              </Line>
              <Line label={t("breakdownNet")}>
                <Num.Money piasters={receipt.netPayable} locale={locale} tone="net" sign={false} />
              </Line>
              {receipt.paidAt ? (
                <Line label={t("paidOn")}>
                  <Num.Date value={receipt.paidAt} locale={locale} />
                </Line>
              ) : null}
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Line({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[13px] text-ink-2">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
