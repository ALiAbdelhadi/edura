# -*- coding: utf-8 -*-
"""
_common.py — ما تشترك فيه أدوات الترحيل: قراءة الملفات، وجدول أسماء الأعمدة.

يعيش الجدول هنا **مرة واحدة**. ثلاث نسخ منه في ثلاثة سكربتات تعني ثلاثة تعريفات
لـ«عمود الهاتف»، حرةً في أن تختلف — وهو بالضبط العطب الذي تتجنبه خدمة الاستيراد
نفسها حين تستورد `findStudentByKeys` بدل أن تعيد اشتقاق «نفس الطفل».
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# منقول حرفيًا من HEADER_ALIASES في
# packages/server-core/src/services/center/student-csv.ts
# أي مرادف يُضاف هناك يُنقل هنا.
# ---------------------------------------------------------------------------
HEADER_ALIASES: dict[str, list[str]] = {
    "name": ["name", "student name", "student", "fullname", "full name",
             "الاسم", "اسم الطالب", "الطالب", "اسم"],
    "phone": ["phone", "mobile", "phone number",
              "الهاتف", "الموبايل", "التليفون", "رقم الهاتف", "الجوال", "الموبيل"],
    "nationalId": ["national id", "nationalid", "national_id", "nid",
                   "الرقم القومي", "رقم قومي", "الرقم_القومي"],
    "guardianName": ["guardian name", "parent name", "guardian", "parent",
                     "ولي الأمر", "اسم ولي الأمر", "ولي الامر", "اسم ولي الامر"],
    "guardianPhone": ["guardian phone", "parent phone",
                      "هاتف ولي الأمر", "رقم ولي الأمر", "هاتف ولي الامر",
                      "رقم ولي الامر", "تليفون ولي الأمر"],
    "guardianEmail": ["guardian email", "parent email", "email",
                      "بريد ولي الأمر", "ايميل ولي الأمر", "الايميل", "البريد"],
}

# محارف غير مرئية تكثر في الجداول العربية وتكسر أي مقارنة نصية دون أن تظهر على
# الشاشة. مكتوبة بترقيمها لا بلصقها: محرف غير مرئي داخل الكود لا يراه المراجع —
# وقد انزلقت مسافة عادية داخل هذه القائمة أول مرة فحُذفت كل المسافات من الأسماء.
_ZERO_WIDTH = [
    0x200B, 0x200C, 0x200D,                    # مسافة/فاصل/واصل صفري العرض
    0x200E, 0x200F, 0x061C,                    # علامات اتجاه LRM / RLM / ALM
    0x202A, 0x202B, 0x202C, 0x202D, 0x202E,    # تضمين وتجاوز الاتجاه
    0x2066, 0x2067, 0x2068, 0x2069,            # عزل الاتجاه
    0xFEFF, 0x00AD,                            # BOM، وشرطة اختيارية
]
# مسافات غير قياسية: تُحوَّل إلى مسافة عادية ولا تُحذف — فهي فاصل بين شيئين.
_SPACE_LIKE = [0x00A0, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
               0x2007, 0x2008, 0x2009, 0x200A, 0x202F, 0x205F, 0x3000]
INVISIBLE: dict[int, str | None] = {cp: None for cp in _ZERO_WIDTH}
INVISIBLE.update({cp: " " for cp in _SPACE_LIKE})


def read_text(path: Path, encoding: str = "auto") -> str:
    if encoding != "auto":
        return path.read_text(encoding=encoding)
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "utf-8", "cp1256"):
        try:
            text = raw.decode(enc)
        except UnicodeDecodeError:
            continue
        if enc == "cp1256":
            print(f"⚠️  {path.name}: قُرئ بترميز cp1256 (ويندوز عربي) — راجع عيّنة "
                  "من الأسماء بعينك قبل الاعتماد عليه.", file=sys.stderr)
        return text
    raise SystemExit(f"تعذّر فك ترميز {path} — حدّد --encoding يدويًا")


def sniff_delimiter(text: str) -> str:
    """نفس قاعدة المستورد: tab إن كان أكثر من الفاصلة في السطر الأول."""
    first = text.split("\n", 1)[0]
    return "\t" if first.count("\t") > first.count(",") else ","


def canon_header(h: str) -> str:
    return re.sub(r"\s+", " ", h.translate(INVISIBLE).strip().lower())


def map_columns(header: list[str]) -> dict[str, int]:
    """أول تطابق يفوز — نفس قاعدة المستورد، فلا يحجب عنوان مكرر سابقه."""
    found: dict[str, int] = {}
    for idx, cell in enumerate(header):
        c = canon_header(cell)
        for field, aliases in HEADER_ALIASES.items():
            if c in aliases and field not in found:
                found[field] = idx
    return found


def is_blank(row: list[str]) -> bool:
    return all(c.strip() == "" for c in row)


def read_records(path: Path, encoding: str = "auto",
                 delimiter: str = "auto") -> tuple[list[str], list[list[str]], str]:
    """
    يعيد (الرأس, السجلات, الفاصل). «سجل» لا «سطر»: خانة مقتبسة بداخلها سطر جديد
    سجلٌ واحد — وهو ما يفعله المستورد ومقسّم الواجهة، فترقيمنا يطابق ترقيمهما.
    """
    text = read_text(path, encoding)
    if not text.strip():
        raise SystemExit(f"{path} فارغ")
    delim = sniff_delimiter(text) if delimiter == "auto" else delimiter
    rows = list(csv.reader(text.splitlines(True), delimiter=delim))
    if not rows:
        raise SystemExit(f"{path} فارغ")
    return rows[0], rows[1:], delim


def write_csv(path: Path, header: list[str], rows: list[list[str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh, delimiter=",", quoting=csv.QUOTE_MINIMAL)
        w.writerow(header)
        w.writerows(rows)


def dump_dicts(path: Path | None, fields: list[str], data: list[dict[str, str]]) -> None:
    """يكتب تقريرًا. المسار `-` يعني الطباعة على الشاشة."""
    if not path:
        return
    if str(path) == "-":
        w = csv.DictWriter(sys.stdout, fieldnames=fields)
        w.writeheader()
        w.writerows(data)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(data)
