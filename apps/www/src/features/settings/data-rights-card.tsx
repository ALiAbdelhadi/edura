"use client";

/* بياناتك وحقوقك / Data rights — Law 151/2020, made operable.
   ══════════════════════════════════════════════════════════════════════════════

   Two rights, one card, and the card's whole job is to be TRUE rather than
   reassuring:

   - THE EXPORT SAYS WHEN IT EXPIRES, on the row, before it is downloaded. A file
     that vanishes silently teaches people the feature is broken.
   - THE DELETION SAYS WHAT SURVIVES, above the button, not after the click. The
     money ledger is retained by law; someone who learns that only afterwards was
     misled by the interface, however carefully the privacy policy worded it.
   - A MINOR IS TOLD WHY, NOT SHOWN A MISSING BUTTON. The server returns
     eligibility with a reason; a hidden control just reads as a bug.
   - REQUESTING IS NOT DELETING, and the copy never lets that blur. The button says
     «اطلب حذف الحساب», the confirm says the team will review it, and the pending
     state offers to withdraw. */

import { useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { Download, ShieldAlert, TriangleAlert } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";

import { SectionHead } from "@/features/parent/ledger-kit";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { asArray } from "@/lib/refine/as-array";

type ExportRow = {
  id: string;
  status: "pending" | "processing" | "ready" | "failed" | "expired";
  requestedAt: string;
  expiresAt: string | null;
  byteSize: number | null;
};

type DeletionState = {
  isMinor: boolean;
  canRequestSelf: boolean;
  pending: { id: string; requestedAt: string } | null;
  requests: { id: string; status: string; requestedAt: string; reviewNote: string | null }[];
};

const STATUS_KEY = {
  pending: "exportPending",
  processing: "exportProcessing",
  ready: "exportReady",
  failed: "exportFailed",
  expired: "exportExpired",
} as const;

export function DataRightsCard() {
  const t = useTranslations("dataRights");
  const { formatDate } = useFormatters();

  const exportsReq = useCustom({ url: "me/data-rights/exports", method: "get" });
  const deletionReq = useCustom({ url: "me/data-rights/deletion", method: "get" });
  const { mutateAsync: post } = useCustomMutation();

  const exports = asArray<ExportRow>(exportsReq.result?.data);
  const deletion = deletionReq.result?.data as DeletionState | undefined;

  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");

  const requestExport = async () => {
    setBusy(true);
    try {
      await post({ url: "me/data-rights/exports", method: "post", values: {} });
      toast.success(t("exportRequested"));
      void exportsReq.query.refetch();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t("exportFail"));
    } finally {
      setBusy(false);
    }
  };

  const requestDeletion = async () => {
    setBusy(true);
    try {
      await post({
        url: "me/data-rights/deletion",
        method: "post",
        values: reason.trim() ? { reason: reason.trim() } : {},
      });
      toast.success(t("deleteRequested"));
      setConfirmOpen(false);
      setReason("");
      void deletionReq.query.refetch();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t("deleteFail"));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (id: string) => {
    setBusy(true);
    try {
      await post({ url: `me/data-rights/deletion/${id}`, method: "delete", values: {} });
      toast.success(t("deleteWithdrawn"));
      void deletionReq.query.refetch();
    } catch {
      toast.error(t("deleteFail"));
    } finally {
      setBusy(false);
    }
  };

  // Anything not finished blocks a second request — same rule the database
  // enforces, surfaced so the button explains itself instead of erroring.
  const inFlight = exports.find((e) => e.status === "pending" || e.status === "processing");
  const ready = exports.find((e) => e.status === "ready");

  return (
    <section className="flex flex-col gap-3">
      <SectionHead title={t("title")} />

      {/* ── EXPORT ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-rule bg-sheet p-4">
        <p className="text-[13px] font-semibold text-ink">{t("exportTitle")}</p>
        <p className="mt-1 text-[13px] text-ink-2">{t("exportBody")}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button disabled={busy || !!inFlight} onClick={() => void requestExport()}>
            {t("exportRequest")}
          </Button>
          {inFlight ? (
            <span className="text-[12px] text-ink-3">{t("exportInFlight")}</span>
          ) : null}
        </div>

        {exports.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2 border-t border-rule-2 pt-3">
            {exports.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 text-[12px]">
                <span className="text-ink-2">
                  {t(STATUS_KEY[e.status])} —{" "}
                  <span className="num" dir="ltr">
                    {formatDate(e.requestedAt)}
                  </span>
                </span>

                {e.status === "ready" ? (
                  <span className="flex flex-wrap items-center gap-3">
                    {e.expiresAt ? (
                      <span className="text-ink-3">
                        {t("exportExpiresAt", { when: formatDate(e.expiresAt) })}
                      </span>
                    ) : null}
                    <a
                      href={`/api/v1/me/data-rights/exports/${e.id}`}
                      className="inline-flex items-center gap-1.5 text-indigo underline-offset-2 hover:underline"
                    >
                      <Download className="size-3.5" aria-hidden="true" />
                      {t("exportDownload")}
                    </a>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {ready ? (
          <p className="mt-2 text-[11px] text-ink-3">{t("exportExpiryNotice")}</p>
        ) : null}
      </div>

      {/* ── DELETION ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-rule bg-sheet p-4">
        <p className="text-[13px] font-semibold text-ink">{t("deleteTitle")}</p>
        <p className="mt-1 text-[13px] text-ink-2">{t("deleteBody")}</p>

        {/* What survives, stated BEFORE the button. */}
        <p className="mt-2 flex gap-2 rounded-lg border border-rule bg-field p-3 text-[12px] text-ink-2">
          <TriangleAlert className="mt-px size-3.5 shrink-0 text-amber" aria-hidden="true" />
          <span>{t("deleteLedgerNotice")}</span>
        </p>

        {deletion?.pending ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] text-amber">
              {t("deletePending", { when: formatDate(deletion.pending.requestedAt) })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => deletion.pending && void withdraw(deletion.pending.id)}
            >
              {t("deleteWithdraw")}
            </Button>
          </div>
        ) : deletion?.isMinor && !deletion.canRequestSelf ? (
          // The reason, not a missing button.
          <p className="mt-3 flex gap-2 text-[12px] text-ink-2">
            <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>{t("deleteMinorNotice")}</span>
          </p>
        ) : (
          <Button
            variant="outline"
            className="mt-3"
            disabled={busy || !deletion?.canRequestSelf}
            onClick={() => setConfirmOpen(true)}
          >
            {t("deleteRequest")}
          </Button>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => !busy && setConfirmOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-ink-2">{t("deleteConfirmBody")}</p>
          <p className="rounded-lg border border-rule bg-field p-3 text-[12px] text-ink-2">
            {t("deleteLedgerNotice")}
          </p>
          <label className="text-xs">
            <span className="mb-1 block text-ink-2">{t("deleteReasonLabel")}</span>
            <Input
              value={reason}
              placeholder={t("deleteReasonPlaceholder")}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmOpen(false)}>
              {t("cancel")}
            </Button>
            <Button disabled={busy} onClick={() => void requestDeletion()}>
              {t("deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
