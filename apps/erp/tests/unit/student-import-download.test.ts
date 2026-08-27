import { describe, expect, it } from "vitest";
import {
  mergeSummaries,
  resultFileName,
  type ImportRow,
} from "@/features/admin/student-import-result";

type Row = ImportRow;

function summary(rows: Row[], dryRun = false) {
  return {
    dryRun,
    total: rows.length,
    created: rows.filter((r) => r.status === "created").length,
    reused: rows.filter((r) => r.status === "reused").length,
    duplicatesInFile: rows.filter((r) => r.status === "duplicate_in_file").length,
    failed: rows.filter((r) => r.status === "error").length,
    rows,
  };
}

describe("merging chunk results", () => {
  it("keeps every row from every chunk, in order", () => {
    const parts = [0, 20, 40].map((offset) =>
      summary(
        Array.from({ length: 20 }, (_, i) => ({
          line: offset + i + 2,
          name: `student ${offset + i}`,
          status: "created" as const,
          studentCode: `G${offset + i}`,
        })),
      ),
    );

    const merged = mergeSummaries(parts, false);

    expect(merged.total).toBe(60);
    expect(merged.created).toBe(60);
    expect(merged.rows).toHaveLength(60);
    expect(merged.rows.map((r) => r.line)).toEqual(
      Array.from({ length: 60 }, (_, i) => i + 2),
    );
  });

  it("preserves the student code on every row — the crosswalk is built from it", () => {
    const merged = mergeSummaries(
      [
        summary([{ line: 2, name: "أحمد", status: "created", studentCode: "G7K3M2QF" }]),
        summary([
          {
            line: 3,
            name: "سارة",
            status: "reused",
            studentCode: "GA4B7C1D",
            matchedOn: "phone",
          },
        ]),
      ],
      false,
    );

    expect(merged.rows.map((r) => r.studentCode)).toEqual(["G7K3M2QF", "GA4B7C1D"]);
    expect(merged.rows[1].matchedOn).toBe("phone");
  });

  it("carries a failed row rather than dropping it", () => {
    const merged = mergeSummaries(
      [
        summary([{ line: 2, name: "", status: "error", errorCode: "name_required" }]),
        summary([{ line: 3, name: "عمر", status: "created", studentCode: "GX1" }]),
      ],
      false,
    );

    expect(merged.failed).toBe(1);
    expect(merged.rows).toHaveLength(merged.total);
  });
});

describe("naming the saved file", () => {
  it("marks a dry run as a preview and a real run as a result", () => {
    const rows: Row[] = [{ line: 2, name: "أحمد", status: "would_create" }];
    expect(resultFileName(summary(rows, true), "students.csv")).toBe(
      "students.preview.json",
    );
    expect(resultFileName(summary(rows, false), "students.csv")).toBe(
      "students.import-result.json",
    );
  });

  it("drops the source extension and survives an Arabic name", () => {
    const s = summary([], false);
    expect(resultFileName(s, "كشف الطلاب.csv")).toBe("كشف الطلاب.import-result.json");
    expect(resultFileName(s, "roster.tsv")).toBe("roster.import-result.json");
    expect(resultFileName(s, "roster.2026.csv")).toBe("roster.2026.import-result.json");
  });

  it("falls back to a name rather than producing a dotfile", () => {
    expect(resultFileName(summary([], false), null)).toBe("students.import-result.json");
  });
});
