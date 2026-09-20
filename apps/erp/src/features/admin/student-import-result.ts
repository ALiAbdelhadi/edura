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
  keys?: string[];
  errorCode?:
    | "name_required"
    | "invalid_national_id"
    | "national_id_scientific"
    | "invalid_phone"
    | "invalid_guardian_phone"
    | "already_exists";
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
  columns?: ImportColumns;
};

export type ImportField =
  | "name"
  | "phone"
  | "nationalId"
  | "guardianName"
  | "guardianPhone"
  | "guardianEmail";

export type ImportColumns = {
  mapped: { field: ImportField; header: string }[];
  ignored: string[];
};

// The server de-duplicates within one chunk only; the same child on line 3 and
// line 250 lands in different chunks. Folding them here, on the keys the server
// normalised, keeps the preview's counts true. At commit the later row has
// already been linked to the child the earlier one created — no second record
// either way — and it is reported as the duplicate it is.
export function mergeSummaries(parts: ImportSummary[], dryRun: boolean): ImportSummary {
  const seen = new Map<string, number>();
  const out: ImportSummary = {
    dryRun, total: 0, created: 0, reused: 0, duplicatesInFile: 0, failed: 0, rows: [],
  };
  for (const p of parts) {
    out.total += p.total;
    out.created += p.created;
    out.reused += p.reused;
    out.duplicatesInFile += p.duplicatesInFile;
    out.failed += p.failed;
    out.columns ??= p.columns;
    for (const row of p.rows) {
      const keys = row.keys ?? [];
      const firstLine = keys.map((k) => seen.get(k)).find((l) => l !== undefined);
      if (firstLine !== undefined && row.status !== "error" && row.status !== "duplicate_in_file") {
        if (row.status === "created" || row.status === "would_create") out.created--;
        else out.reused--;
        out.duplicatesInFile++;
        out.rows.push({ ...row, status: "duplicate_in_file", duplicateOfLine: firstLine });
        continue;
      }
      if (row.status !== "error") for (const k of keys) if (!seen.has(k)) seen.set(k, row.line);
      out.rows.push(row);
    }
  }
  return out;
}

// Every chunk repeats the header, so the file's own line numbers only survive if
// blank lines inside the sheet are kept in place: the server skips them but still
// counts them. Only trailing blanks are dropped, and a chunk of nothing but blanks
// is not sent at all.
export function toChunks(csv: string, size: number): { csv: string; lineOffset: number }[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of csv.replace(/^\uFEFF/, "")) {
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
  while (dataLines.length && dataLines[dataLines.length - 1].trim() === "") dataLines.pop();
  const chunks: { csv: string; lineOffset: number }[] = [];
  for (let i = 0; i < dataLines.length; i += size) {
    const slice = dataLines.slice(i, i + size);
    if (slice.every((l) => l.trim() === "")) continue;
    chunks.push({ csv: [header, ...slice].join("\n"), lineOffset: i });
  }
  return chunks;
}

// Excel on an Arabic Windows saves "CSV" as Windows-1256, not UTF-8; read as UTF-8
// every Arabic name arrives as replacement characters. Strict UTF-8 first, and the
// Arabic code page only when the bytes are not valid UTF-8.
export function decodeSpreadsheetText(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1256").decode(bytes);
  }
}

export const IMPORT_TEMPLATE_CSV =
  "\uFEFFالاسم,الموبايل,الرقم القومي,اسم ولي الأمر,موبايل ولي الأمر,ايميل ولي الأمر\r\n" +
  "أحمد محمد علي,01012345678,30801011234567,محمد علي,01112345678,parent@example.com\r\n";

export function downloadTemplate(): void {
  const blob = new Blob([IMPORT_TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "edura-students-template.csv";
  a.click();
  URL.revokeObjectURL(url);
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
