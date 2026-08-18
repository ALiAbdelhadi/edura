"use client";

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
import { Download, FileUp, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Badge, Num, type BadgeTone } from "./ledger";
import {
  downloadSummary,
  mergeSummaries,
  type ImportRow,
  type ImportSummary,
} from "./student-import-result";

/**
 * Bulk student import — pick a file, PREVIEW, then commit.
 *
 * THE PREVIEW IS NOT DECORATION. The first call is always `dryRun: true`: the
 * server reads the file and reports what it WOULD do without writing anything.
 * A center importing 400 children needs to see "312 new, 86 already known, 2
 * rejected" before it happens, not after — and "already known" is the number
 * that tells them the dedup worked rather than quietly doubling their roster.
 *
 * The file never leaves the browser as a file: it is read with FileReader and
 * posted as text, so there is no upload endpoint, no temp storage and no file
 * on a disk somewhere holding a few hundred children's names.
 */

/** Rows shown in the table. The counts above it always cover the whole file. */
const MAX_VISIBLE_ROWS = 60;

/**
 * Rows per request.
 *
 * NOT a tuning knob — a correctness bound. Each row costs a transaction and
 * ~8 database round trips, so a whole file in one request would blow through
 * both the serverless execution limit AND the browser's HTTP timeout. It was
 * found the bad way: a 10.4s request against a 10s client default reported
 * "failed" for an import that had in fact succeeded. Small chunks keep every
 * request short, and give a 400-row upload a progress bar instead of a spinner
 * that looks hung.
 */
const CHUNK_ROWS = 20;

/** Envelope-aware POST. Long AbortSignal because a chunk is still real work. */
async function postChunk(body: {
  csv: string;
  dryRun: boolean;
  lineOffset: number;
}): Promise<ImportSummary> {
  const res = await fetch("/api/v1/center/students/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const json = (await res.json()) as
    | { data: ImportSummary }
    | { error: { message: string } };
  if (!res.ok || "error" in json) {
    throw new Error("error" in json ? json.error.message : `HTTP ${res.status}`);
  }
  return json.data;
}

/** Split a parsed file into chunk payloads, each carrying the header row. */
function toChunks(csv: string): { csv: string; lineOffset: number }[] {
  // Split on newlines that are NOT inside quotes, so a quoted guardian name
  // containing a newline is never torn in half across two requests.
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of csv.replace(/^﻿/, "")) {
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === "\n" && !inQuotes) {
      lines.push(current.replace(/\r$/, ""));
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) lines.push(current.replace(/\r$/, ""));

  const [header, ...dataLines] = lines;
  if (header === undefined) return [];
  const rows = dataLines.filter((l) => l.trim() !== "");
  const chunks: { csv: string; lineOffset: number }[] = [];
  for (let i = 0; i < rows.length; i += CHUNK_ROWS) {
    chunks.push({
      csv: [header, ...rows.slice(i, i + CHUNK_ROWS)].join("\n"),
      // The server numbers a chunk's first data row as line 2; the same row in
      // the center's own file is line 2 + i.
      lineOffset: i,
    });
  }
  return chunks;
}


/**
 * Colour follows the ledger's discipline (primitives.tsx): teal = confirmed,
 * indigo = informational, amber = needs your attention, red = blocking. A
 * reused student is INFO, not a warning — linking an existing child is the
 * system working, and colouring it amber would read as a problem.
 */
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
  /** Called after a COMMITTED import so the list behind can refresh. */
  onImported: () => void;
}) {
  const t = useTranslations();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [committed, setCommitted] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);
  /** {done, total} chunks — a 400-row upload must not look hung. */
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
    reader.onload = () => setCsv(String(reader.result ?? ""));
    // Explicit UTF-8: an Arabic file read in the browser's default encoding
    // comes back as mojibake, and every name in it would import wrong.
    reader.readAsText(file, "utf-8");
  }

  /**
   * Run the whole file, one chunk per request, in SEQUENCE — never in
   * parallel. Two receptionists' worth of concurrent writes for the same
   * children would race the dedup lookup and lean on the unique index to sort
   * it out; sequential requests keep "look, then create" meaningful.
   *
   * A chunk that fails stops the run and keeps what already landed: on a
   * commit those students are really imported, and re-running the same file
   * REUSES them rather than duplicating, so retry is always safe.
   */
  async function send(dryRun: boolean) {
    if (!csv || busy) return;
    const chunks = toChunks(csv);
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
        // Show partial results as they land, so a long run is legible.
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
      // Whatever landed before the failure stays on screen — a partial import
      // the operator can see is far safer than one they have to guess at.
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

  /**
   * A rejected row's reason, in the reader's language. Falls back to the
   * server's raw message for anything the service did not classify — an
   * untranslated true reason beats a guessed one.
   */
  function errorText(row: ImportRow): string {
    switch (row.errorCode) {
      case "name_required":
        return t("adminHome.students_importErrNameRequired");
      case "invalid_national_id":
        return t("adminHome.students_importErrNationalId");
      case "already_exists":
        return t("adminHome.students_importErrAlreadyExists");
      default:
        return row.error ?? "";
    }
  }

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
          {/* What this does NOT do, said before they commit — importing a name
              is not a financial event, and a center should not have to guess. */}
          <p className="text-[12.5px] leading-relaxed text-[var(--ink-3)]">
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
            <span className="truncate text-[13px] text-[var(--ink-3)]">
              {fileName ?? t("adminHome.students_importNoFile")}
            </span>
          </div>

          {result && (
            <div className="space-y-3">
              {/* Partial results appear as each chunk lands, so the heading
                  must not claim completion while requests are still in
                  flight — "تم الاستيراد" over 20 of 27 rows is a lie the
                  operator would act on. */}
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

              <p className="text-[12.5px] leading-relaxed text-[var(--ink-3)]">
                {t("adminHome.students_importReuseNote")}
              </p>

              {/* Only after a COMMITTED run. On a preview nothing was written,
                  so losing the payload costs nothing — saying "download this or
                  lose it" there would train the operator to ignore the notice
                  at the one moment it is true. */}
              {committed && (
                <p className="text-[12.5px] leading-relaxed text-[var(--amber)]">
                  {t("adminHome.students_importDownloadHint")}
                </p>
              )}

              <div className="overflow-x-auto rounded-(--radius-step-md) border border-[var(--rule)]">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--rule)] text-start text-[var(--ink-3)]">
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
                      <tr key={row.line} className="border-b border-[var(--rule)] last:border-0">
                        <td className="px-3 py-2 align-top">
                          <Num>{row.line}</Num>
                        </td>
                        <td className="px-3 py-2 align-top">{row.name}</td>
                        <td className="px-3 py-2 align-top">
                          <Badge tone={STATUS_TONE[row.status]}>{statusLabel(row)}</Badge>
                          {row.matchedOn && (
                            <span className="ms-2 text-[12px] text-[var(--ink-3)]">
                              {row.matchedOn === "phone"
                                ? t("adminHome.students_importMatchedPhone")
                                : t("adminHome.students_importMatchedNationalId")}
                            </span>
                          )}
                          {row.status === "error" && (
                            <span className="ms-2 text-[12px] text-[var(--red)]">
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
                <p className="text-[12px] text-[var(--ink-3)]">
                  {t("adminHome.students_importShowingFirst", { n: MAX_VISIBLE_ROWS })}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="items-center gap-3 sm:justify-between">
          <span className="text-[12.5px] text-[var(--ink-3)]">
            {progress && progress.total > 1 ? (
              <>
                <Num>{progress.done}</Num> / <Num>{progress.total}</Num>
              </>
            ) : null}
          </span>
          <div className="flex items-center gap-2">
          {/* Offered while requests are still in flight too: a run that fails
              half way is exactly when the partial result matters most, because
              those rows ARE written and nothing else records which. */}
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
          {/* Once committed the only action left is to close — a second click
              must not re-run an import that already happened. */}
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

/**
 * Class strings are written out in full, never assembled from a variable:
 * Tailwind scans source text, so a interpolated class name produces no CSS at
 * all and the colour silently does not apply (tailwind-dead-classes.test.ts
 * exists because this has bitten before).
 *
 * A zero stays ink-coloured — "0 rejected" is good news and must not be red.
 */
const TALLY_TONE: Record<Exclude<BadgeTone, "neutral">, string> = {
  done: "text-[var(--teal)]",
  info: "text-[var(--indigo)]",
  pending: "text-[var(--amber)]",
  failed: "text-[var(--red)]",
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
