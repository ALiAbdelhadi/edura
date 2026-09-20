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

export type StudentCsvColumns = {
  mapped: { field: StudentCsvField; header: string }[];
  ignored: string[];
};

export type StudentCsvDelimiter = "," | "\t" | ";";

export type StudentCsvParseResult =
  | { ok: true; rows: StudentCsvRow[]; delimiter: StudentCsvDelimiter; columns: StudentCsvColumns }
  | { ok: false; error: string };

const HEADER_ALIASES: Record<StudentCsvField, string[]> = {
  name: ["name", "student name", "student", "fullname", "full name", "الاسم", "اسم الطالب", "الطالب", "اسم"],
  phone: ["phone", "mobile", "phone number", "الهاتف", "الموبايل", "التليفون", "رقم الهاتف", "الجوال", "الموبيل"],
  nationalId: ["national id", "nationalid", "national_id", "nid", "الرقم القومي", "رقم قومي", "الرقم_القومي"],
  guardianName: ["guardian name", "parent name", "guardian", "parent", "ولي الأمر", "اسم ولي الأمر", "ولي الامر", "اسم ولي الامر"],
  guardianPhone: ["guardian phone", "parent phone", "هاتف ولي الأمر", "رقم ولي الأمر", "هاتف ولي الامر", "رقم ولي الامر", "تليفون ولي الأمر"],
  guardianEmail: ["guardian email", "parent email", "email", "بريد ولي الأمر", "ايميل ولي الأمر", "الايميل", "البريد"],
};

// Folds the spelling differences an Egyptian spreadsheet actually carries —
// hamza forms, ta marbuta, alef maqsura, tatweel, diacritics, punctuation —
// so "رقم موبايل ولي الأمر:" and "رقم موبايل ولى الامر" compare equal.
function canon(h: string): string {
  return h
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[_\-.:*#()\[\]/\\]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

const ALIAS_INDEX: Map<string, StudentCsvField> = (() => {
  const m = new Map<string, StudentCsvField>();
  for (const field of Object.keys(HEADER_ALIASES) as StudentCsvField[]) {
    for (const a of HEADER_ALIASES[field]) m.set(canon(a), field);
  }
  return m;
})();

const has = (c: string, words: string[]) => words.some((w) => c.includes(w));

const GUARDIAN_WORDS = ["ولي", "الاب", "الام", "والد", "parent", "guardian", "father", "mother"];
const PHONE_WORDS = ["موبايل", "موبيل", "هاتف", "تليفون", "تلفون", "جوال", "محمول", "واتس", "phone", "mobile", "tel", "whatsapp", "cell"];
const EMAIL_WORDS = ["email", "e mail", "mail", "ايميل", "بريد"];
const NID_WORDS = ["قومي", "national", "nid", "بطاقه"];
const NAME_WORDS = ["اسم", "name"];
// A header naming a group, teacher, subject or school is never the student's name.
const NOT_A_NAME = ["مجموع", "مدرس", "معلم", "ماده", "مدرسه", "صف", "كورس", "مركز", "سنتر", "group", "teacher", "subject", "school", "course", "class", "center", "centre", "user"];

function matchField(header: string): StudentCsvField | null {
  const c = canon(header);
  if (!c) return null;
  const exact = ALIAS_INDEX.get(c);
  if (exact) return exact;

  const guardian = has(c, GUARDIAN_WORDS);
  if (has(c, EMAIL_WORDS)) return "guardianEmail";
  if (guardian && has(c, PHONE_WORDS)) return "guardianPhone";
  if (guardian && !has(c, NOT_A_NAME)) return "guardianName";
  if (has(c, NID_WORDS)) return "nationalId";
  if (has(c, PHONE_WORDS)) return "phone";
  if (has(c, NAME_WORDS) && !has(c, NOT_A_NAME)) return "name";
  return null;
}

function detectDelimiter(firstLine: string): StudentCsvDelimiter {
  const unquoted = firstLine.replace(/"[^"]*"/g, "");
  const counts: [StudentCsvDelimiter, number][] = [
    [",", (unquoted.match(/,/g) ?? []).length],
    ["\t", (unquoted.match(/\t/g) ?? []).length],
    [";", (unquoted.match(/;/g) ?? []).length],
  ];
  let best = counts[0];
  for (const c of counts) if (c[1] > best[1]) best = c;
  return best[0];
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
  const delimiter = detectDelimiter(firstLine);

  const records = tokenize(text, delimiter);
  if (records.length === 0) return { ok: false, error: "The file is empty" };

  const headerCells = records[0];
  const colIndex: Partial<Record<StudentCsvField, number>> = {};
  const columns: StudentCsvColumns = { mapped: [], ignored: [] };
  headerCells.forEach((h, idx) => {
    const header = h.trim();
    const f = matchField(header);
    if (f && colIndex[f] === undefined) {
      colIndex[f] = idx;
      columns.mapped.push({ field: f, header });
    } else if (header) {
      columns.ignored.push(header);
    }
  });

  if (colIndex.name === undefined) {
    return {
      ok: false,
      error:
        "No recognised name column. The file needs a header row with a name column " +
        "(e.g. \"name\" or \"الاسم\"). Columns found: " +
        (headerCells.map((h) => h.trim()).filter(Boolean).join(", ") || "none"),
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

  return { ok: true, rows, delimiter, columns };
}
