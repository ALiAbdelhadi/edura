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
  studentCode?: string;
  studentId?: string;
  matchedOn?: "phone" | "national_id";
  onOurRoster?: boolean;
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

export function resultFileName(summary: ImportSummary, fileName: string | null): string {
  const base = (fileName ?? "students").replace(/\.[^.]+$/, "");
  return `${base}.${summary.dryRun ? "preview" : "import-result"}.json`;
}

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
