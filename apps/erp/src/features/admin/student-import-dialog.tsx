"use client";

import { api } from "@/lib/api/client";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { toast } from "@repo/ui/components/sonner";
import { Download, FileDown, FileUp, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Badge, Num, type BadgeTone } from "./ledger";
import {
  decodeSpreadsheetText,
  downloadSummary,
  downloadTemplate,
  mergeSummaries,
  toChunks,
  type ImportField,
  type ImportRow,
  type ImportSummary,
} from "./student-import-result";
const MAX_VISIBLE_ROWS = 60;

const CHUNK_ROWS = 20;

async function postChunk(body: {
  csv: string;
  dryRun: boolean;
  lineOffset: number;
}): Promise<ImportSummary> {
  const json = await api
    .post("center/students/import", { json: body, timeout: 120_000 })
    .json<{ data: ImportSummary }>();
  return json.data;
}

const STATUS_TONE: Record<ImportRow["status"], BadgeTone> = {
  created: "done",
  would_create: "done",
  reused: "info",
  would_reuse: "info",
  duplicate_in_file: "pending",
  error: "failed",
};

export function StudentImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const t = useTranslations();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [committed, setCommitted] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const result = committed ?? preview;

  function reset() {
    setFileName(null);
    setCsv(null);
    setPreview(null);
    setCommitted(null);
    setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(null);
    setCommitted(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onerror = () => toast.error(t("adminHome.students_importFailedToRead"));
    reader.onload = () => {
      const buf = reader.result;
      setCsv(buf instanceof ArrayBuffer ? decodeSpreadsheetText(buf) : "");
    };
    reader.readAsArrayBuffer(file);
  }

  async function send(dryRun: boolean) {
    if (!csv || busy) return;
    const chunks = toChunks(csv, CHUNK_ROWS);
    if (chunks.length === 0) {
      toast.error(t("adminHome.students_importFailedToast"));
      return;
    }
    setBusy(true);
    setProgress({ done: 0, total: chunks.length });
    const parts: ImportSummary[] = [];
    try {
      for (const chunk of chunks) {
        parts.push(await postChunk({ ...chunk, dryRun }));
        setProgress({ done: parts.length, total: chunks.length });
        const partial = mergeSummaries(parts, dryRun);
        if (dryRun) setPreview(partial);
        else setCommitted(partial);
      }
      const summary = mergeSummaries(parts, dryRun);
      if (!dryRun) {
        onImported();
        toast.success(
          t("adminHome.students_importDoneToast", {
            created: summary.created,
            reused: summary.reused,
          }),
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("adminHome.students_importFailedToast"),
      );
      if (parts.length > 0) {
        const partial = mergeSummaries(parts, dryRun);
        if (dryRun) setPreview(partial);
        else setCommitted(partial);
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }
  function errorText(row: ImportRow): string {
    switch (row.errorCode) {
      case "name_required":
        return t("adminHome.students_importErrNameRequired");
      case "invalid_national_id":
        return t("adminHome.students_importErrNationalId");
      case "national_id_scientific":
        return t("adminHome.students_importErrNationalIdScientific");
      case "invalid_phone":
        return t("adminHome.students_importErrPhone");
      case "invalid_guardian_phone":
        return t("adminHome.students_importErrGuardianPhone");
      case "already_exists":
        return t("adminHome.students_importErrAlreadyExists");
      default:
        return row.error ?? "";
    }
  }

  const FIELD_LABEL: Record<ImportField, string> = {
    name: t("adminHome.students_importFieldName"),
    phone: t("adminHome.students_importFieldPhone"),
    nationalId: t("adminHome.students_importFieldNationalId"),
    guardianName: t("adminHome.students_importFieldGuardianName"),
    guardianPhone: t("adminHome.students_importFieldGuardianPhone"),
    guardianEmail: t("adminHome.students_importFieldGuardianEmail"),
  };

  function statusLabel(row: ImportRow): string {
    switch (row.status) {
      case "created":
        return t("adminHome.students_importStatusCreated");
      case "would_create":
        return t("adminHome.students_importStatusWouldCreate");
      case "reused":
        return t("adminHome.students_importStatusReused");
      case "would_reuse":
        return t("adminHome.students_importStatusWouldReuse");
      case "duplicate_in_file":
        return t("adminHome.students_importStatusDuplicate", {
          line: row.duplicateOfLine ?? 0,
        });
      case "error":
        return t("adminHome.students_importStatusError");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("adminHome.students_importTitle")}</DialogTitle>
          <DialogDescription>{t("adminHome.students_importHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-[12.5px] leading-relaxed text-(--ink-3)">
            {t("adminHome.students_importNoMoney")}
          </p>

          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values,text/plain"
              onChange={onPick}
              className="hidden"
              data-testid="student-import-file"
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
              <FileUp className="size-4" />
              {t("adminHome.students_importPickFile")}
            </Button>
            <span className="min-w-0 flex-1 truncate text-[13px] text-(--ink-3)">
              {fileName ?? t("adminHome.students_importNoFile")}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={downloadTemplate}
              data-testid="student-import-template"
            >
              <FileDown className="size-4" />
              {t("adminHome.students_importTemplate")}
            </Button>
          </div>
          {result && (
            <div className="space-y-3">
              <p className="text-[13px] font-medium">
                {busy
                  ? result.dryRun
                    ? t("adminHome.students_importPreviewing")
                    : t("adminHome.students_importing")
                  : result.dryRun
                    ? t("adminHome.students_importPreviewTitle")
                    : t("adminHome.students_importDoneTitle")}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Tally label={t("adminHome.students_importTotal")} value={result.total} />
                <Tally label={t("adminHome.students_importCreated")} value={result.created} tone="done" />
                <Tally label={t("adminHome.students_importReused")} value={result.reused} tone="info" />
                <Tally
                  label={t("adminHome.students_importDuplicates")}
                  value={result.duplicatesInFile}
                  tone="pending"
                />
                <Tally label={t("adminHome.students_importFailed")} value={result.failed} tone="failed" />
              </div>
              {result.columns && (
                <div
                  className="space-y-1 rounded-(--radius-step-md) border border-(--rule) px-3 py-2 text-[12.5px] leading-relaxed"
                  data-testid="student-import-columns"
                >
                  <p>
                    <span className="text-(--ink-3)">{t("adminHome.students_importColumnsRead")} </span>
                    {result.columns.mapped
                      .map((c) => `${FIELD_LABEL[c.field]} ← «${c.header}»`)
                      .join(" · ")}
                  </p>
                  {result.columns.ignored.length > 0 && (
                    <p className="text-(--amber)">
                      {t("adminHome.students_importColumnsIgnored", {
                        columns: result.columns.ignored.map((h) => `«${h}»`).join(" · "),
                      })}
                    </p>
                  )}
                </div>
              )}
              <p className="text-[12.5px] leading-relaxed text-(--ink-3)">
                {t("adminHome.students_importReuseNote")}
              </p>
              {committed && (
                <p className="text-[12.5px] leading-relaxed text-(--amber)">
                  {t("adminHome.students_importDownloadHint")}
                </p>
              )}
              <div className="overflow-x-auto rounded-(--radius-step-md) border border-(--rule)">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-(--rule) text-start text-(--ink-3)">
                      <th className="px-3 py-2 text-start font-normal">
                        {t("adminHome.students_importColLine")}
                      </th>
                      <th className="px-3 py-2 text-start font-normal">
                        {t("adminHome.students_importColName")}
                      </th>
                      <th className="px-3 py-2 text-start font-normal">
                        {t("adminHome.students_importColResult")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, MAX_VISIBLE_ROWS).map((row) => (
                      <tr key={row.line} className="border-b border-(--rule) last:border-0">
                        <td className="px-3 py-2 align-top">
                          <Num>{row.line}</Num>
                        </td>
                        <td className="px-3 py-2 align-top">{row.name}</td>
                        <td className="px-3 py-2 align-top">
                          <Badge tone={STATUS_TONE[row.status]}>{statusLabel(row)}</Badge>
                          {row.matchedOn && (
                            <span className="ms-2 text-[12px] text-(--ink-3)">
                              {row.matchedOn === "phone"
                                ? t("adminHome.students_importMatchedPhone")
                                : t("adminHome.students_importMatchedNationalId")}
                            </span>
                          )}
                          {row.onOurRoster === false && (
                            <span className="ms-2 text-[12px] text-(--ink-3)">
                              {t("adminHome.students_importMatchedElsewhere")}
                            </span>
                          )}
                          {row.status === "error" && (
                            <span className="ms-2 text-[12px] text-destructive">
                              {errorText(row)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.rows.length > MAX_VISIBLE_ROWS && (
                <p className="text-[12px] text-(--ink-3)">
                  {t("adminHome.students_importShowingFirst", { n: MAX_VISIBLE_ROWS })}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="items-center gap-3 sm:justify-between">
          <span className="text-[12.5px] text-(--ink-3)">
            {progress && progress.total > 1 ? (
              <>
                <Num>{progress.done}</Num> / <Num>{progress.total}</Num>
              </>
            ) : null}
          </span>
          <div className="flex items-center gap-2">
          {result && result.rows.length > 0 && (
            <Button
              variant="outline"
              onClick={() => downloadSummary(result, fileName)}
              data-testid="student-import-download"
            >
              <Download className="size-4" />
              {t("adminHome.students_importDownload")}
            </Button>
          )}
          {!committed && (
            <>
              <Button
                variant="outline"
                onClick={() => send(true)}
                disabled={!csv || busy}
                data-testid="student-import-preview"
              >
                {busy && !preview
                  ? t("adminHome.students_importPreviewing")
                  : t("adminHome.students_importPreview")}
              </Button>
              <Button
                onClick={() => send(false)}
                disabled={!preview || busy}
                data-testid="student-import-confirm"
              >
                <Upload className="size-4" />
                {busy && preview
                  ? t("adminHome.students_importing")
                  : t("adminHome.students_importConfirm")}
              </Button>
            </>
          )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const TALLY_TONE: Record<Exclude<BadgeTone, "neutral">, string> = {
  done: "text-[var(--teal)]",
  info: "text-[var(--indigo)]",
  pending: "text-[var(--amber)]",
  failed: "text-destructive",
};

function Tally({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: Exclude<BadgeTone, "neutral">;
}) {
  return (
    <div className="rounded-(--radius-step-md) border border-[var(--rule)] px-3 py-2">
      <div className="text-[12px] text-[var(--ink-3)]">{label}</div>
      <div className={tone && value > 0 ? TALLY_TONE[tone] : undefined}>
        <Num>{value}</Num>
      </div>
    </div>
  );
}
