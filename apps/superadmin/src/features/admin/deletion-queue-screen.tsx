"use client";

/* طلبات حذف الحسابات / Account deletion queue.
   ══════════════════════════════════════════════════════════════════════════════

   The most irreversible action in the back office, so it gets the full commit
   treatment — and the treatment is EARNED here, unlike on a feature flag:

   - TWO STEPS, because the erasure cannot be undone. The confirm dialog restates
     what will be destroyed and what will survive, in that order.
   - THE NOTE IS REQUIRED for both approve and reject. An erasure request refused
     without a reason is one the person cannot appeal, and under Law 151/2020 it
     is appealable.
   - THE SURVIVING RECORD IS NAMED UP FRONT, not in a footnote. An operator
     approving this must know before they press that the money ledger stays —
     otherwise the first angry phone call teaches them.
   - A HALF-FINISHED ERASURE CANNOT HIDE. A request approved by the older center
     flow soft-deleted the account without scrubbing it; those rows show
     «الحساب مُعطَّل لكن البيانات الشخصية لم تُمحَ بعد» with a repair action,
     rather than sitting in the list looking finished. */

import { useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { ShieldOff, TriangleAlert } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Num } from "@repo/ui/components/num";
import { StatusBadge } from "@repo/ui/components/status-badge";
import { Textarea } from "@repo/ui/components/textarea";
import { toast } from "@repo/ui/components/sonner";
import { formatDate, type Locale } from "@repo/ui/lib/format";

import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner } from "@/components/kit/spinner";

type Row = {
  id: string;
  userId: string;
  subject: { id: string; name: string; email: string | null; role: string; status: string } | null;
  requestedByName: string | null;
  origin: "self" | "guardian" | "center";
  status: "pending" | "approved" | "rejected" | "cancelled";
  reason: string;
  requesterNote: string | null;
  reviewNote: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  anonymizedAt: string | null;
};

const STATUS_TONE = {
  pending: "pending",
  approved: "paid",
  rejected: "rejected",
  cancelled: "neutral",
} as const;

export function DeletionQueueScreen() {
  const t = useTranslations("deletionQueue");
  const locale = useLocale() as Locale;

  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [confirming, setConfirming] = useState<Row | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const query: Record<string, string> = { page: String(page), limit: "25" };
  if (status !== "all") query.status = status;

  const req = useCustom({ url: "admin/deletion-requests", method: "get", config: { query } });
  const { mutateAsync: decide } = useCustomMutation();

  const result = req.result?.data as
    | { data: Row[]; total: number; pendingCount: number }
    | undefined;
  const rows = result?.data ?? [];
  const total = result?.total ?? 0;

  const send = async (row: Row, decision: "approve" | "reject" | "anonymize", why?: string) => {
    setBusy(true);
    try {
      await decide({
        url: `admin/deletion-requests/${row.id}`,
        method: "post",
        values: { decision, note: why, locale },
      });
      toast.success(decision === "reject" ? t("rejectedOk") : t("approvedOk"));
      setConfirming(null);
      setNote("");
      void req.query.refetch();
    } catch {
      toast.error(t("actionFail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title={t("title")} description={t("subtitle")} rule />

      {/* What survives, said BEFORE anyone presses anything. */}
      <p className="flex gap-2 rounded-lg border border-rule bg-field p-3 text-[13px] text-ink-2">
        <TriangleAlert className="mt-px size-4 shrink-0 text-amber" aria-hidden="true" />
        <span>{t("ledgerNotice")}</span>
      </p>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rule bg-sheet px-4 py-3 shadow-[var(--lift)]">
        {(["pending", "approved", "rejected", "cancelled", "all"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? "default" : "outline"}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
          >
            {t(`status.${s}`)}
          </Button>
        ))}
        <span className="ms-auto flex items-baseline gap-1.5 text-[13px] text-ink-2">
          <Num.Figure value={total} locale={locale} />
          {t("totalSuffix")}
        </span>
      </div>

      {req.query.isLoading ? (
        <PageSpinner label={t("loading")} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ShieldOff} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-rule bg-sheet p-4 shadow-[var(--lift)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">
                      {row.subject?.name ?? "—"}
                    </span>
                    <StatusBadge tone={STATUS_TONE[row.status]}>{t(`status.${row.status}`)}</StatusBadge>
                    <StatusBadge tone="neutral">{t(`origin.${row.origin}`)}</StatusBadge>
                  </div>

                  {row.subject?.email ? (
                    <Num.Code className="mt-1 block text-[11px]">{row.subject.email}</Num.Code>
                  ) : null}

                  <p className="mt-2 text-[13px] text-ink-2">
                    <span className="text-ink-3">{t("reason")}: </span>
                    {row.requesterNote || row.reason}
                  </p>

                  <p className="mt-1.5 text-xs text-ink-3">
                    {t("requestedBy")}: {row.requestedByName ?? "—"} —{" "}
                    {formatDate(row.requestedAt, locale, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>

                  {row.reviewNote ? (
                    <p className="mt-1.5 text-xs text-ink-3">
                      {t("reviewNote")}: {row.reviewNote}
                    </p>
                  ) : null}

                  {/* The state that must not look finished. */}
                  {row.status === "approved" ? (
                    row.anonymizedAt ? (
                      <p className="mt-1.5 text-xs text-teal">
                        {t("anonymized", {
                          when: formatDate(row.anonymizedAt, locale, {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          }),
                        })}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs font-medium text-amber">{t("notAnonymized")}</p>
                    )
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col gap-2">
                  {row.status === "pending" ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => {
                          setConfirming(row);
                          setNote("");
                        }}
                      >
                        {t("approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || !note.trim()}
                        onClick={() => void send(row, "reject", note)}
                      >
                        {t("reject")}
                      </Button>
                      <Textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={t("reviewNotePlaceholder")}
                        className="h-16 w-64 text-[12px]"
                      />
                    </>
                  ) : row.status === "approved" && !row.anonymizedAt ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => void send(row, "anonymize")}
                    >
                      {t("anonymizeNow")}
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Step two. Restates the destruction and the survival, then commits. */}
      <Dialog open={!!confirming} onOpenChange={(o) => !busy && !o && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("approveConfirmTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-ink-2">{t("approveConfirmBody")}</p>
          <p className="rounded-lg border border-rule bg-field p-3 text-[12px] text-ink-2">
            {t("ledgerNotice")}
          </p>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirming(null)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !note.trim()}
              onClick={() => confirming && void send(confirming, "approve", note)}
            >
              {t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {total > 25 ? (
        <div className="flex items-center justify-between gap-3 text-xs text-ink-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t("prev")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page * 25 >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("next")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
