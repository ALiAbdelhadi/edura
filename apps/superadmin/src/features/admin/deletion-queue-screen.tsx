"use client";

import { useState } from "react";
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
import { Label } from "@repo/ui/components/label";
import { Num } from "@repo/ui/components/num";
import { StatusBadge, statusTone } from "@repo/ui/components/status-badge";
import { Textarea } from "@repo/ui/components/textarea";
import { formatDate, type Locale } from "@repo/ui/lib/format";

import { ListButtonFilter, ListShell } from "@/components/kit/list-shell";
import { asKey } from "@/lib/i18n/keys";
import { useCustomListScreen } from "@/lib/api/use-list-screen";
import { useAction } from "@/lib/api/use-action";

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

// A deletion request the subject CANCELLED is not a refusal — it is simply
// withdrawn — so it stays neutral instead of the shared map's rejected red.
const DELETION_TONE = { cancelled: "neutral" } as const;

export function DeletionQueueScreen() {
  const t = useTranslations("deletionQueue");
  const locale = useLocale() as Locale;

  const [confirming, setConfirming] = useState<{
    row: Row;
    decision: "approve" | "reject";
  } | null>(null);
  const [note, setNote] = useState("");

  const list = useCustomListScreen<Row>({
    url: "admin/deletion-requests",
    initialFilters: { status: "pending" },
    select: (data) => {
      const d = data as { data?: Row[]; total?: number } | undefined;
      return { rows: d?.data ?? [], total: d?.total ?? 0 };
    },
  });
  const { run: decide, busy } = useAction({
    onSuccess: () => list.query.refetch(),
  });

  const send = async (row: Row, decision: "approve" | "reject" | "anonymize", why?: string) => {
    const res = await decide({
      url: `admin/deletion-requests/${row.id}`,
      values: { decision, note: why, locale },
      successMsg: decision === "reject" ? t("rejectedOk") : t("approvedOk"),
    });
    if (res.ok) {
      setConfirming(null);
      setNote("");
    }
  };

  return (
    <ListShell
      list={list}
      title={t("title")}
      description={t("subtitle")}
      loadingLabel={t("loading")}
      emptyIcon={ShieldOff}
      emptyTitle={t("emptyTitle")}
      emptyDescription={t("emptyBody")}
      notice={
        <p className="flex gap-2 rounded-lg border border-rule bg-field p-3 text-[13px] text-ink-2">
          <TriangleAlert className="mt-px size-4 shrink-0 text-amber" aria-hidden="true" />
          <span>{t("ledgerNotice")}</span>
        </p>
      }
      toolbar={
        <>
          <ListButtonFilter
            list={list}
            name="status"
            options={["pending", "approved", "rejected", "cancelled"]}
            render={(s) => t(asKey(`status.${s}`))}
            allLabel={t("status.all")}
          />
          <span className="ms-auto flex items-baseline gap-1.5 text-[13px] text-ink-2">
            <Num.Figure value={list.total} locale={locale} />
            {t("totalSuffix")}
          </span>
        </>
      }
      // Each request is a paragraph of context — who asked, why, what was
      // noted, whether the row was anonymized — not a row of cells.
      body={
        <ul className="flex flex-col gap-3">
          {list.rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-rule bg-sheet p-4 shadow-[var(--lift)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">
                      {row.subject?.name ?? "—"}
                    </span>
                    <StatusBadge tone={statusTone(row.status, DELETION_TONE)}>{t(`status.${row.status}`)}</StatusBadge>
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
                          setConfirming({ row, decision: "approve" });
                          setNote("");
                        }}
                      >
                        {t("approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setConfirming({ row, decision: "reject" });
                          setNote("");
                        }}
                      >
                        {t("reject")}
                      </Button>
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
      }
    >
      <Dialog open={!!confirming} onOpenChange={(o) => !busy && !o && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirming?.decision === "reject"
                ? t("rejectConfirmTitle")
                : t("approveConfirmTitle")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-ink-2">
            {confirming?.decision === "reject"
              ? t("rejectConfirmBody")
              : t("approveConfirmBody")}
          </p>
          {confirming ? (
            <p className="text-[13px] font-semibold text-ink">
              {confirming.row.subject?.name ?? "—"}
            </p>
          ) : null}
          {confirming?.decision === "approve" ? (
            <p className="rounded-lg border border-rule bg-field p-3 text-[12px] text-ink-2">
              {t("ledgerNotice")}
            </p>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deletion-review-note">{t("reviewNote")}</Label>
            <Textarea
              id="deletion-review-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("reviewNotePlaceholder")}
              className="h-20 text-[13px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirming(null)}>
              {t("cancel")}
            </Button>
            <Button
              variant={confirming?.decision === "reject" ? "default" : "destructive"}
              disabled={busy || !note.trim()}
              onClick={() => confirming && void send(confirming.row, confirming.decision, note)}
            >
              {confirming?.decision === "reject" ? t("reject") : t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListShell>
  );
}
