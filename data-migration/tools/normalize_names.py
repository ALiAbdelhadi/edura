#!/usr/bin/env python3
"""
normalize_names.py — توحيد الأسماء العربية في ملف طلاب قبل استيراده إلى Edura.

╔══════════════════════════════════════════════════════════════════════════╗
║  التفرقة التي يقوم عليها هذا الملف كله:                                  ║
║                                                                          ║
║  الاسم المكتوب (يُخزَّن)  ≠  مفتاح المطابقة (لا يُخزَّن أبدًا)             ║
╚══════════════════════════════════════════════════════════════════════════╝

«توحيد الأسماء العربية» يُقصد به عادةً: أ/إ/آ ← ا، ة ← ه، ى ← ي. تطبيق ذلك على
الاسم **المخزَّن** ليس توحيدًا بل إعادةُ كتابة اسم إنسان: «سارة» ليست «ساره»،
والاسم الذي يُطبع على بطاقة الطالب ويُنادى به عند الكاونتر يجب أن يكون كما
تكتبه أسرته. لذلك:

  * ما يُكتب في ملف الاستيراد **محافظ**: يُحذف منه ما ليس من الاسم أصلًا —
    علامات اتجاه غير مرئية، كشيدة زخرفية (ـــ)، تشكيل، مسافات مكررة، وحروف
    كُتبت بمحارف فارسية/أردية تشبه العربية تمامًا وتختلف عنها في الترميز
    (ک ی ھ) أو بأشكال العرض التي تنتجها ملفات PDF. كل هذه **لا تغيّر حرفًا
    واحدًا من الاسم**، بل تصلح تمثيله.
  * وحدة التوحيد الشرس (أ/إ/آ، ة/ه، ى/ي، ال التعريف، ترتيب الكلمات) تُبنى في
    **مفتاح مطابقة** يعيش في التقرير وحده، ولا يدخل قاعدة البيانات أبدًا.
    وظيفته الوحيدة: أن يقول لبشر «هذان الصفان غالبًا طفل واحد، انظر فيهما».

ولماذا يهم هذا هنا تحديدًا: **المستورد لا يطابق بالاسم إطلاقًا** — مفاتيحه
الهاتف والرقم القومي (`findStudentByKeys`). فطفل مكتوب مرتين بإملاءين مختلفين
وبلا هاتف مشترك سيصير **حسابين** بكودين وسجلَّي حضور. هذا السكربت لا يستطيع
دمجهما — ولا يحاول — لكنه يدلّك على المكان الذي ينقصه مفتاح، وهو الشيء الوحيد
النافع الذي يمكن لتحليل الأسماء أن يفعله بصدق.

ما لا يفعله، عمدًا:
  * لا يصحّح إملاءً بالتخمين، ولا يكمل اسمًا ناقصًا، ولا يخترع كلمة.
  * لا يدمج صفين ولا يحذف صفًا. عدد صفوف الخرج = عدد صفوف الدخل، ويُتحقق منه.
  * لا يوحّد أ/إ/آ ولا ة/ه في الاسم المخزَّن ولو بدت متطابقة — انظر أعلى الملف.

الاستخدام:

    # مراجعة فقط (افتراضي — لا يكتب شيئًا)
    python3 normalize_names.py --in 01-source/students.csv --report -

    # التطبيق
    python3 normalize_names.py \\
        --in  02-work/students.phones-done.csv \\
        --out 03-output/students.csv \\
        --report 04-reports/names-report.csv \\
        --dup-report 04-reports/names-suspected-duplicates.csv

يُشغَّل **بعد** normalize_contacts.py على مخرجه، لا على المصدر مباشرة.
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from pathlib import Path

from _common import (
    INVISIBLE,
    dump_dicts,
    is_blank,
    map_columns,
    read_records,
    write_csv,
)


TATWEEL = "ـ"
TASHKEEL = re.compile(r"[ً-ْٓ-ٰٕۖ-ۭ]")

LOOKALIKES = str.maketrans({
    "ک": "ك",
    "ڪ": "ك",
    "ی": "ي",
    "ي": "ي",
    "ھ": "ه",
    "ە": "ه",
    "ہ": "ه",
    "ں": "ن",
})

TITLE_RE = re.compile(
    r"^\s*(?:"
    r"[أاإ]\s*/|م\s*/|د\s*/|أ\.?\s*د\s*/|"
    r"(?:ال)?(?:طالب|طالبه|طالبة|أستاذ|استاذ|أستاذة|استاذه|استاذة|مدرس|مدرسة|مستر|ميس)"
    r"\s*[/:\-]?"
    r")\s*",
)
ROW_NUMBER_RE = re.compile(r"^\s*[\d٠-٩]{1,4}\s*[\-\.\)،:]\s*")
PAREN_RE = re.compile(r"\s*[\(\[\{][^\)\]\}]*[\)\]\}]\s*")
TRAILING_TAG_RE = re.compile(r"\s+[\-–_]\s*\S{1,12}\s*$")

EDGE_PUNCT = " \t\"'«»…,.;:،؛-–_/\\|*#"

AL_RE = re.compile(r"^(?:ال)(?=.{3,})")

COMPOUND_HEADS = {"عبد", "ابو", "أبو", "بن", "ابن", "ام", "أم"}


def safe_normalize(raw: str) -> str:
    """
    إصلاح تمثيل الاسم دون تغيير حرف منه.

    NFKC هي التي تعيد أشكال العرض (ﻣﺤﻤﺪ) وروابط PDF إلى حروف عادية وتفكّ
    «ﷲ» إلى «الله» — وهي الحالة الغالبة في الملفات المستخرجة من مسح ضوئي.
    """
    s = unicodedata.normalize("NFKC", raw)
    s = s.translate(INVISIBLE).translate(LOOKALIKES)
    s = s.replace(TATWEEL, "")
    s = TASHKEEL.sub("", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s.strip(EDGE_PUNCT).strip()


def strip_noise(name: str) -> tuple[str, list[str]]:
    """حذف ما ليس اسمًا: ترقيم الصف، الألقاب، التعليقات، لاحقة الصف الدراسي."""
    notes: list[str] = []
    out = name
    if ROW_NUMBER_RE.match(out):
        out = ROW_NUMBER_RE.sub("", out)
        notes.append("ترقيم صف")
    if TITLE_RE.match(out):
        out = TITLE_RE.sub("", out)
        notes.append("لقب")
    if PAREN_RE.search(out):
        out = PAREN_RE.sub(" ", out)
        notes.append("تعليق بين قوسين")
    if TRAILING_TAG_RE.search(out):
        out = TRAILING_TAG_RE.sub("", out)
        notes.append("لاحقة بعد شرطة")
    out = re.sub(r"\s+", " ", out).strip(EDGE_PUNCT).strip()
    return out, notes


def match_key(name: str) -> str:
    """
    مفتاح لكشف «نفس الطفل بإملاءين». **لا يُكتب في أي ملف استيراد.**

    الكلمات تُرتَّب أبجديًا لأن «محمد أحمد علي» و«علي محمد أحمد» طفل واحد في
    كشف مكتوب على عجل.
    """
    s = safe_normalize(name)
    s, _ = strip_noise(s)
    s = s.translate(str.maketrans({
        "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا",
        "ة": "ه", "ى": "ي", "ؤ": "و", "ئ": "ي",
    }))
    tokens = [t for t in s.split(" ") if t]

    merged: list[str] = []
    skip = False
    for i, tok in enumerate(tokens):
        if skip:
            skip = False
            continue
        if tok in COMPOUND_HEADS and i + 1 < len(tokens):
            merged.append(tok + tokens[i + 1])
            skip = True
        else:
            merged.append(tok)

    cleaned = [AL_RE.sub("", t) for t in merged]
    cleaned = [t for t in cleaned if len(t) > 1]
    return " ".join(sorted(cleaned))


ARABIC_LETTER = re.compile(r"[ء-ي]")
LATIN_LETTER = re.compile(r"[A-Za-z]")


def inspect(name: str) -> tuple[str, str]:
    """يعيد (الحالة, ملاحظة) لما يحتاج عين بشر."""
    if not name:
        return "empty", "خانة الاسم فارغة — المستورد يرفض الصف (name_required)"
    digits = sum(c.isdigit() for c in name)
    if digits and digits >= len(name.replace(" ", "")) / 2:
        return "looks_numeric", "الخانة أرقام في أغلبها — غالبًا عمود مُزاح"
    if len(name) > 120:
        return "too_long", f"{len(name)} حرفًا — شاشات المنصة الأخرى تحدّه بـ120"
    if ARABIC_LETTER.search(name) and LATIN_LETTER.search(name):
        return "script_mixed", "عربي ولاتيني في اسم واحد"
    if len(name.split(" ")) == 1:
        return "single_token", "كلمة واحدة — المنصة تقبله، لكنه نادرًا ما يكفي للتمييز"
    return "ok", ""


def main() -> int:
    ap = argparse.ArgumentParser(
        description="توحيد الأسماء العربية في ملف طلاب قبل استيراده إلى Edura",
    )
    ap.add_argument("--in", dest="src", required=True, type=Path)
    ap.add_argument("--out", type=Path, default=None,
                    help="ملف الخرج. بلا هذا الخيار: مراجعة فقط، لا كتابة")
    ap.add_argument("--report", type=Path, default=None,
                    help="تقرير التغييرات صفًا صفًا (- للطباعة على الشاشة)")
    ap.add_argument("--dup-report", type=Path, default=None,
                    help="تقرير الصفوف المشتبه أنها لطفل واحد بإملاءين")
    ap.add_argument("--encoding", default="auto")
    ap.add_argument("--delimiter", default="auto", choices=["auto", ",", "\t"])
    ap.add_argument("--strip-noise", action="store_true",
                    help="احذف ترقيم الصف والألقاب والتعليقات بين قوسين ولاحقة "
                         "الصف الدراسي. مطفأ افتراضيًا: حذف كلمة من اسم إنسان "
                         "قرار يُرى قبل أن يُنفَّذ — شغّل بلا الخيار أولًا واقرأ التقرير.")
    args = ap.parse_args()

    header, body, delim = read_records(args.src, args.encoding, args.delimiter)
    cols = map_columns(header)
    if "name" not in cols:
        raise SystemExit("لا يوجد عمود اسم معروف — المستورد سيرفض الملف كله.")

    targets = [("name", cols.get("name")), ("guardianName", cols.get("guardianName"))]
    if cols.get("guardianName") is None:
        print("ℹ️  لا يوجد عمود لاسم ولي الأمر.", file=sys.stderr)

    report_rows: list[dict[str, str]] = []
    counters: dict[str, int] = {}
    out_body: list[list[str]] = []
    by_key: dict[str, list[tuple[int, str]]] = {}

    for i, row in enumerate(body):
        line = i + 2
        if is_blank(row):
            out_body.append(row)
            continue
        row = list(row) + [""] * (len(header) - len(row))

        for field, idx in targets:
            if idx is None or idx >= len(row):
                continue
            original = row[idx]
            if not original.strip() and field == "guardianName":
                counters[f"{field}:empty"] = counters.get(f"{field}:empty", 0) + 1
                continue

            value = safe_normalize(original)
            notes: list[str] = []
            if args.strip_noise:
                value, notes = strip_noise(value)
            else:
                _, would = strip_noise(value)
                if would:
                    notes = ["مرشّح للحذف بـ--strip-noise: " + "، ".join(would)]

            status, note = inspect(value)
            if status == "ok":
                if notes:
                    status = "noise_stripped" if args.strip_noise else "noise_candidate"
                elif value != original:
                    status = "fixed"
            counters[f"{field}:{status}"] = counters.get(f"{field}:{status}", 0) + 1

            if value != original or status != "ok":
                report_rows.append({
                    "line": str(line), "field": field,
                    "original": original, "normalized": value,
                    "status": status,
                    "note": "؛ ".join([n for n in [note, *notes] if n]),
                    "match_key": match_key(value) if field == "name" else "",
                })

            row[idx] = value
            if field == "name" and value:
                by_key.setdefault(match_key(value), []).append((line, value))

        out_body.append(row)

    dup_rows: list[dict[str, str]] = []
    for key, entries in by_key.items():
        if len(entries) < 2:
            continue
        spellings = {name for _, name in entries}
        dup_rows.append({
            "kind": "same_key" if len(spellings) > 1 else "identical",
            "match_key": key,
            "lines": " ، ".join(str(l) for l, _ in entries),
            "names": " | ".join(sorted(spellings)),
            "note": "نفس المفتاح بإملاءين مختلفين" if len(spellings) > 1
                    else "اسم مكرر حرفيًا",
        })

    keys = [(k, v) for k, v in by_key.items() if k]
    for a_key, a_entries in keys:
        a_tokens = set(a_key.split(" "))
        if len(a_tokens) < 2:
            continue
        for b_key, b_entries in keys:
            if a_key >= b_key:
                continue
            b_tokens = set(b_key.split(" "))
            if a_tokens < b_tokens or b_tokens < a_tokens:
                dup_rows.append({
                    "kind": "token_subset",
                    "match_key": f"{a_key}  ⊂/⊃  {b_key}",
                    "lines": " ، ".join(str(l) for l, _ in a_entries + b_entries),
                    "names": " | ".join(sorted({n for _, n in a_entries + b_entries})),
                    "note": "اسم أقصر يطابق جزءًا من اسم أطول — قد يكون نفس الطفل",
                })

    if len(out_body) != len(body):
        raise SystemExit(f"خلل داخلي: دخل {len(body)} صفًا وخرج {len(out_body)} — أوقفتُ الكتابة")

    if args.out:
        write_csv(args.out, header, out_body)

    dump_dicts(args.report,
               ["line", "field", "original", "normalized", "status", "note", "match_key"],
               report_rows)
    dump_dicts(args.dup_report, ["kind", "match_key", "lines", "names", "note"], dup_rows)

    print(f"\nالمصدر: {args.src}   (فاصل: {'TAB' if delim == chr(9) else 'فاصلة'})")
    print(f"صفوف الدخل: {len(body)}   صفوف الخرج: {len(out_body)}   ✅ لا صف مفقود")
    labels = {
        "ok": "سليم كما هو", "fixed": "وُحِّد تمثيله", "empty": "فارغ",
        "noise_candidate": "فيه ما ليس اسمًا (لم يُحذف — راجعه)",
        "noise_stripped": "حُذف منه ما ليس اسمًا",
        "looks_numeric": "أرقام لا اسم — عمود مُزاح؟",
        "too_long": "أطول من 120 حرفًا", "script_mixed": "خلط عربي/لاتيني",
        "single_token": "كلمة واحدة",
    }
    for field, _ in targets:
        keys_f = {k: v for k, v in counters.items() if k.startswith(field + ":")}
        if not keys_f:
            continue
        print(f"\n  {field}")
        for k, v in sorted(keys_f.items(), key=lambda kv: -kv[1]):
            print(f"    {labels.get(k.split(':', 1)[1], k.split(':', 1)[1]):<32} {v}")

    if dup_rows:
        print(f"\n⚠️  {len(dup_rows)} اشتباهًا في تكرار بالاسم:")
        for d in dup_rows[:15]:
            print(f"    [{d['kind']}] أسطر {d['lines']}: {d['names']}")
        if len(dup_rows) > 15:
            print(f"    … و{len(dup_rows) - 15} غيرها في تقرير التكرار")
        print("    ⚠️  المستورد **لا يطابق بالاسم** — هؤلاء سيصيرون حسابات منفصلة ما لم")
        print("       يتشاركوا هاتفًا أو رقمًا قوميًا. القرار وإصلاح المفتاح لبشر.")

    empties = counters.get("name:empty", 0)
    if empties:
        print(f"\n🔴 {empties} صفًا بلا اسم — المستورد سيرفض كلًا منها (name_required).")
    if not args.out:
        print("\n(مراجعة فقط — لم يُكتب ملف خرج. أضف --out عند الاقتناع.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
