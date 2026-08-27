export type StudentCsvField =
  | "name"
  | "phone"
  | "nationalId"
  | "guardianName"
  | "guardianPhone"
  | "guardianEmail";

export type StudentCsvRow = {
  line: number;
  name: string;
  phone: string | null;
  nationalId: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
};

export type StudentCsvParseResult =
  | { ok: true; rows: StudentCsvRow[]; delimiter: "," | "\t" }
  | { ok: false; error: string };

const HEADER_ALIASES: Record<StudentCsvField, string[]> = {
  name: ["name", "student name", "student", "fullname", "full name", "الاسم", "اسم الطالب", "الطالب", "اسم"],
  phone: ["phone", "mobile", "phone number", "الهاتف", "الموبايل", "التليفون", "رقم الهاتف", "الجوال", "الموبيل"],
  nationalId: ["national id", "nationalid", "national_id", "nid", "الرقم القومي", "رقم قومي", "الرقم_القومي"],
  guardianName: ["guardian name", "parent name", "guardian", "parent", "ولي الأمر", "اسم ولي الأمر", "ولي الامر", "اسم ولي الامر"],
  guardianPhone: ["guardian phone", "parent phone", "هاتف ولي الأمر", "رقم ولي الأمر", "هاتف ولي الامر", "رقم ولي الامر", "تليفون ولي الأمر"],
  guardianEmail: ["guardian email", "parent email", "email", "بريد ولي الأمر", "ايميل ولي الأمر", "الايميل", "البريد"],
};

function canon(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchField(header: string): StudentCsvField | null {
  const c = canon(header);
  for (const field of Object.keys(HEADER_ALIASES) as StudentCsvField[]) {
    if (HEADER_ALIASES[field].includes(c)) return field;
  }
  return null;
}

function tokenize(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      i++;
      continue;
    }
    if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      pushRecord();
      i++;
      continue;
    }
    if (ch === "\n") {
      pushRecord();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || record.length > 0) pushRecord();
  return records;
}

function cell(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

export function parseStudentCsv(input: string): StudentCsvParseResult {
  let text = input.replace(/^﻿/, "");
  if (!text.trim()) return { ok: false, error: "The file is empty" };

  const firstLine = text.slice(0, text.search(/[\r\n]|$/));
  const delimiter: "," | "\t" =
    (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? "\t" : ",";

  const records = tokenize(text, delimiter);
  if (records.length === 0) return { ok: false, error: "The file is empty" };

  const headerCells = records[0];
  const colIndex: Partial<Record<StudentCsvField, number>> = {};
  headerCells.forEach((h, idx) => {
    const f = matchField(h);
    if (f && colIndex[f] === undefined) colIndex[f] = idx;
  });

  if (colIndex.name === undefined) {
    return {
      ok: false,
      error:
        "No recognised name column. The file needs a header row with a name column " +
        "(e.g. \"name\" or \"الاسم\").",
    };
  }

  const rows: StudentCsvRow[] = [];
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    if (rec.every((c) => c.trim() === "")) continue;
    const at = (f: StudentCsvField) => (colIndex[f] !== undefined ? cell(rec[colIndex[f]!]) : null);
    rows.push({
      line: r + 1, // 1-based, header is line 1
      name: at("name") ?? "",
      phone: at("phone"),
      nationalId: at("nationalId"),
      guardianName: at("guardianName"),
      guardianPhone: at("guardianPhone"),
      guardianEmail: at("guardianEmail"),
    });
  }

  return { ok: true, rows, delimiter };
}
