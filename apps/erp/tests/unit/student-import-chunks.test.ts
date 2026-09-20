import { describe, expect, it } from "vitest";
import { parseStudentCsv } from "@repo/server-core/services/center/student-csv";
import {
  decodeSpreadsheetText,
  mergeSummaries,
  toChunks,
  type ImportRow,
  type ImportSummary,
} from "@/features/admin/student-import-result";

describe("toChunks — the center's own line numbers survive chunking", () => {
  it("a blank line in the middle of the sheet does not shift later line numbers", () => {
    const csv = "name\nA\n\nB\nC\nD\n\n\n";
    const chunks = toChunks(csv, 2);
    const lines = chunks.flatMap((c) => {
      const p = parseStudentCsv(c.csv);
      if (!p.ok) throw new Error(p.error);
      return p.rows.map((r) => [r.name, r.line + c.lineOffset]);
    });
    // In the file: header=1, A=2, blank=3, B=4, C=5, D=6
    expect(lines).toEqual([["A", 2], ["B", 4], ["C", 5], ["D", 6]]);
  });

  it("does not send a chunk made only of blank lines", () => {
    expect(toChunks("name\nA\n\n\n\nB\n", 2).every((c) => c.csv.split("\n").slice(1).some((l) => l.trim()))).toBe(true);
  });
});

describe("decodeSpreadsheetText", () => {
  it("reads UTF-8 as UTF-8", () => {
    const bytes = new TextEncoder().encode("الاسم\nمنى\n");
    expect(decodeSpreadsheetText(bytes.buffer as ArrayBuffer)).toBe("الاسم\nمنى\n");
  });

  it("falls back to Windows-1256 — what Excel on Arabic Windows saves as plain CSV", () => {
    // "منى" in Windows-1256: م=0xE3 ن=0xE4 ى=0xEC
    const bytes = new Uint8Array([0xe3, 0xe4, 0xec]);
    expect(decodeSpreadsheetText(bytes.buffer)).toBe("منى");
  });
});

describe("mergeSummaries — one child split across two chunks", () => {
  const part = (rows: ImportRow[]): ImportSummary => ({
    dryRun: true,
    total: rows.length,
    created: rows.filter((r) => r.status === "would_create").length,
    reused: rows.filter((r) => r.status === "would_reuse").length,
    duplicatesInFile: 0,
    failed: 0,
    rows,
  });

  it("the later row becomes a duplicate of the earlier LINE and the counts follow", () => {
    const s = mergeSummaries(
      [
        part([{ line: 3, name: "عمر", status: "would_create", keys: ["+201011440002"] }]),
        part([
          { line: 25, name: "منى", status: "would_create", keys: ["+201099999999"] },
          { line: 28, name: "عمر (مكرر)", status: "would_create", keys: ["+201011440002"] },
        ]),
      ],
      true,
    );
    expect(s.rows[2]).toMatchObject({ status: "duplicate_in_file", duplicateOfLine: 3 });
    expect([s.created, s.duplicatesInFile, s.total]).toEqual([2, 1, 3]);
  });

  it("an errored row claims no key", () => {
    const s = mergeSummaries(
      [
        part([{ line: 2, name: "x", status: "error", keys: ["+201011440002"] }]),
        part([{ line: 30, name: "y", status: "would_create", keys: ["+201011440002"] }]),
      ],
      true,
    );
    expect(s.rows[1].status).toBe("would_create");
  });
});
