import { describe, expect, it } from "vitest";
import {
  exportFilename,
  toCsv,
  type ExportTable,
} from "@repo/server-core/services/reports/report-export";

const table: ExportTable = {
  columns: [
    { key: "month", header: { ar: "الشهر", en: "Month" }, type: "text" },
    { key: "revenue", header: { ar: "الإيرادات", en: "Revenue" }, type: "money" },
    { key: "count", header: { ar: "العدد", en: "Count" }, type: "number" },
  ],
  rows: [{ month: "2026-07", revenue: 1234567, count: 12 }],
  totalRow: { month: "—", revenue: 1234567, count: 12 },
};

describe("toCsv — Excel compatibility", () => {
  it("starts with a UTF-8 BOM, without which Excel mojibakes every Arabic name", () => {
    expect(toCsv(table).startsWith("﻿")).toBe(true);
  });

  it("uses CRLF line endings", () => {
    const out = toCsv(table);
    expect(out).toContain("\r\n");
    expect(out.split("\r\n").length).toBeGreaterThan(2);
  });

  it("writes the header in the requested script", () => {
    expect(toCsv(table, { locale: "ar" })).toContain("الشهر");
    expect(toCsv(table, { locale: "en" })).toContain("Month");
  });
});

describe("toCsv — money", () => {
  it("renders piasters as a plain decimal Excel can SUM (no symbol, no separators)", () => {
    const out = toCsv(table);
    expect(out).toContain("12345.67");
    expect(out).not.toContain("EGP");
    expect(out).not.toContain("ج.م");
    expect(out).not.toMatch(/12,345/);
  });

  it("keeps a negative amount numeric — a loss must not become text", () => {
    const out = toCsv({ ...table, rows: [{ month: "x", revenue: -50, count: 0 }] });
    expect(out).toContain("-0.50");
    expect(out).not.toContain("'-0.50");
  });

  it("pads the piaster part", () => {
    const out = toCsv({ ...table, rows: [{ month: "x", revenue: 5, count: 0 }] });
    expect(out).toContain("0.05");
  });
});

describe("toCsv — formula injection", () => {
  it.each(["=1+1", "+1", "@SUM(A1)", "-2+3", "\tx"])(
    "neutralises a text cell starting with %j",
    (evil) => {
      const out = toCsv({
        columns: [{ key: "a", header: { ar: "أ", en: "A" }, type: "text" }],
        rows: [{ a: evil }],
      });
      expect(out).toContain(`'${evil}`.replace(/^'\t/, "'\t"));
      expect(out).not.toMatch(new RegExp(`(^|\\r\\n)${evil.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m"));
    },
  );

  it("leaves an ordinary Arabic name untouched", () => {
    const out = toCsv({
      columns: [{ key: "a", header: { ar: "أ", en: "A" }, type: "text" }],
      rows: [{ a: "محمد حسن" }],
    });
    expect(out).toContain("محمد حسن");
    expect(out).not.toContain("'محمد");
  });
});

describe("toCsv — RFC 4180 quoting", () => {
  it("quotes a value containing a comma, and doubles an embedded quote", () => {
    const out = toCsv({
      columns: [{ key: "a", header: { ar: "أ", en: "A" }, type: "text" }],
      rows: [{ a: 'عبد الله، محمد' }, { a: 'قال "أهلاً"' }],
    });
    expect(out).toContain('"قال ""أهلاً"""');
  });

  it("quotes a value containing a newline so the row is not torn in two", () => {
    const out = toCsv({
      columns: [{ key: "a", header: { ar: "أ", en: "A" }, type: "text" }],
      rows: [{ a: "line1\nline2" }],
    });
    expect(out).toContain('"line1\nline2"');
  });

  it("renders null as an empty cell, never the string 'null'", () => {
    const out = toCsv({
      columns: [
        { key: "a", header: { ar: "أ", en: "A" }, type: "text" },
        { key: "b", header: { ar: "ب", en: "B" }, type: "number" },
      ],
      rows: [{ a: null, b: null }],
    });
    expect(out).not.toContain("null");
    expect(out.trimEnd().endsWith(",")).toBe(true);
  });
});

describe("toCsv — the header block", () => {
  it("puts the title and range above the table, separated by a blank line", () => {
    const out = toCsv(table, {
      locale: "ar",
      title: "كشف الأرباح",
      meta: [{ label: "الفترة", value: "2026-07-01 → 2026-07-31" }],
    });
    const lines = out.replace("﻿", "").split("\r\n");
    expect(lines[0]).toBe("كشف الأرباح");
    expect(lines[1]).toContain("الفترة");
    expect(lines[2]).toBe("");
    expect(lines[3]).toContain("الشهر");
  });

  it("includes the total row as an ordinary final row", () => {
    const lines = toCsv(table).trimEnd().split("\r\n");
    expect(lines[lines.length - 1]).toContain("12345.67");
  });
});

describe("exportFilename", () => {
  it("is the report key plus the date, so downloads sort", () => {
    expect(exportFilename("net-profit", "2026-08-09T12:34:56.000Z")).toBe(
      "net-profit-2026-08-09.csv",
    );
  });
});
