import { describe, expect, it } from "vitest";
import { parseStudentCsv } from "@repo/server-core/services/center/student-csv";

function rows(text: string) {
  const r = parseStudentCsv(text);
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r;
}

describe("parseStudentCsv — happy paths", () => {
  it("parses English headers into typed rows", () => {
    const r = rows("name,phone,national id\nAhmed Ali,01001234567,12345678901234\n");
    expect(r.delimiter).toBe(",");
    expect(r.rows).toEqual([
      {
        line: 2,
        name: "Ahmed Ali",
        phone: "01001234567",
        nationalId: "12345678901234",
        guardianName: null,
        guardianPhone: null,
        guardianEmail: null,
      },
    ]);
  });

  it("parses ARABIC headers — the common case in this market", () => {
    const r = rows("الاسم,رقم الهاتف,الرقم القومي,ولي الأمر\nمحمد حسن,01112223334,29901010101019,حسن محمد\n");
    expect(r.rows[0]).toMatchObject({
      name: "محمد حسن",
      phone: "01112223334",
      nationalId: "29901010101019",
      guardianName: "حسن محمد",
    });
  });

  it("strips a UTF-8 BOM (Excel on Windows) so the first header still matches", () => {
    const r = rows("﻿name,phone\nSara,0100\n");
    expect(r.rows[0].name).toBe("Sara");
    expect(r.rows[0].phone).toBe("0100");
  });

  it("handles CRLF line endings", () => {
    const r = rows("name,phone\r\nAli,0101\r\nOmar,0102\r\n");
    expect(r.rows.map((x) => x.name)).toEqual(["Ali", "Omar"]);
  });

  it("detects TSV when tabs outnumber commas", () => {
    const r = rows("name\tphone\nAhmed, the elder\t0100\n");
    expect(r.delimiter).toBe("\t");
    expect(r.rows[0].name).toBe("Ahmed, the elder");
  });

  it("is column-order independent and ignores unknown columns", () => {
    const r = rows("notes,phone,الاسم,section\nvip,0100,ليلى,3A\n");
    expect(r.rows[0]).toMatchObject({ name: "ليلى", phone: "0100" });
  });

  it("skips blank lines (Excel usually leaves a trailing one)", () => {
    const r = rows("name\nAli\n\n\nOmar\n\n");
    expect(r.rows.map((x) => x.name)).toEqual(["Ali", "Omar"]);
  });

  it("reports 1-based ORIGINAL line numbers, header = line 1", () => {
    const r = rows("name\nA\nB\nC\n");
    expect(r.rows.map((x) => x.line)).toEqual([2, 3, 4]);
  });

  it("trims cells and turns empty ones into null, never empty strings", () => {
    const r = rows("name,phone,guardian email\n  Nour  ,   ,\n");
    expect(r.rows[0]).toMatchObject({ name: "Nour", phone: null, guardianEmail: null });
  });
});

describe("parseStudentCsv — RFC-4180 quoting", () => {
  it("keeps a comma inside a quoted field instead of splitting on it", () => {
    const r = rows('name,guardian name\nYoussef,"محمد، أحمد"\n');
    expect(r.rows[0].guardianName).toBe("محمد، أحمد");
    expect(r.rows[0].name).toBe("Youssef");
  });

  it("unescapes a doubled quote inside a quoted field", () => {
    const r = rows('name\n"Ali ""Abu Omar"" Hassan"\n');
    expect(r.rows[0].name).toBe('Ali "Abu Omar" Hassan');
  });

  it("keeps a newline inside a quoted field as one row", () => {
    const r = rows('name,guardian name\nMona,"line one\nline two"\n');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].guardianName).toBe("line one\nline two");
  });

  it("parses a final row with no trailing newline", () => {
    const r = rows("name,phone\nAli,0100");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].phone).toBe("0100");
  });
});

describe("parseStudentCsv — whole-file failures", () => {
  it("rejects an empty file", () => {
    expect(parseStudentCsv("")).toEqual({ ok: false, error: "The file is empty" });
    expect(parseStudentCsv("   \n  ")).toMatchObject({ ok: false });
  });

  it("rejects a file with no recognised name column, naming what is needed", () => {
    const r = parseStudentCsv("phone,section\n0100,3A\n");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/name column/i);
  });

  it("a header with NO data rows parses ok — the import service reports that", () => {
    const r = rows("name,phone\n");
    expect(r.rows).toEqual([]);
  });
});
