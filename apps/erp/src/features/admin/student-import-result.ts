/**
 * The import result as DATA — merging the chunks and saving the document.
 *
 * Kept out of the dialog component on purpose: this is the only record that
 * maps a row in the center's own spreadsheet to the student code the platform
 * minted for it, so it is worth testing directly, and importing the component
 * to test it drags in next-intl and a whole React tree.
 */

export type ImportRow = {
  line: number;
  name: string;
  status:
    | "created"
    | "reused"
    | "duplicate_in_file"
    | "would_create"
    | "would_reuse"
    | "error";
  /** Present on a resolved row; absent on a duplicate or a failure. */
  studentCode?: string;
  studentId?: string;
  matchedOn?: "phone" | "national_id";
  duplicateOfLine?: number;
  errorCode?: "name_required" | "invalid_national_id" | "already_exists";
  error?: string;
};

export type ImportSummary = {
  dryRun: boolean;
  total: number;
  created: number;
  reused: number;
  duplicatesInFile: number;
  failed: number;
  rows: ImportRow[];
};

export function mergeSummaries(parts: ImportSummary[], dryRun: boolean): ImportSummary {
  return parts.reduce<ImportSummary>(
    (acc, p) => ({
      dryRun,
      total: acc.total + p.total,
      created: acc.created + p.created,
      reused: acc.reused + p.reused,
      duplicatesInFile: acc.duplicatesInFile + p.duplicatesInFile,
      failed: acc.failed + p.failed,
      rows: [...acc.rows, ...p.rows],
    }),
    { dryRun, total: 0, created: 0, reused: 0, duplicatesInFile: 0, failed: 0, rows: [] },
  );
}

/**
 * A preview and a committed run are named differently on purpose: reconciling a
 * migration against a dry run would report success for writes that never
 * happened. The reconcile tool refuses a `dryRun` payload as well — two guards,
 * because this one is a filename and filenames get renamed.
 */
export function resultFileName(summary: ImportSummary, fileName: string | null): string {
  const base = (fileName ?? "students").replace(/\.[^.]+$/, "");
  return `${base}.${summary.dryRun ? "preview" : "import-result"}.json`;
}

/**
 * Save the result so the migration can be RECONCILED afterwards.
 *
 * WHY THIS EXISTS. The dialog's table shows only its first rows and never shows
 * `studentCode`, so after importing 400 children there was NO way, from any
 * surface, to obtain the mapping between a row in the center's spreadsheet and
 * the code this platform gave it. Nothing stores the center's old id, so that
 * mapping lives in exactly one place: this response. Once the dialog closed it
 * was gone, and "did student 312 land correctly?" became unanswerable.
 *
 * Written from the MERGED summary, so a 400-row import that took 20 requests
 * still saves as one document containing every row.
 */
export function downloadSummary(summary: ImportSummary, fileName: string | null): void {
  const blob = new Blob([JSON.stringify(summary, null, 1)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = resultFileName(summary, fileName);
  a.click();
  URL.revokeObjectURL(url);
}
