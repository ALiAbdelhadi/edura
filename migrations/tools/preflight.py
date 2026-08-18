#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
preflight.py — آخر بوابة قبل الرفع: هل المستورد سيفهم هذا الملف، وهل كل عمود
يحوي فعلًا ما يقوله اسمه؟

فحصان مختلفان في أداة واحدة لأنهما يُطرحان في اللحظة نفسها:

  **الشكل** — هل تُطابَق العناوين بجدول المستورد أصلًا؟ ملفٌّ لا يجد المستورد
  فيه عمود اسم يُرفض كاملًا، ولا يُكتشف ذلك إلا عند الرفع بعد ساعة عمل.

  **المحتوى** — هل عمود «الرقم القومي» يحوي أرقامًا قومية؟ هذا هو الفحص الذي
  يمسك أخطر خطأ في الترحيل كله: **عمودان متبادلان**. ترتيبٌ خاطئ في
  `--columns` أو خريطة حقول مقلوبة يُهبط الهواتف في عمود الرقم القومي، فيرفض
  المستورد كل صف («ليس 14 خانة») أو — أسوأ — يقبل ما صادف طوله 14 ويخزّنه
  مفتاحًا فريدًا باسم إنسان آخر. لا يوجد في هذه اللحظة ما يُنبّه: كل خانة
  سليمة الشكل، والخطأ في مكانها لا في قيمتها.

يُشغَّل مرتين في المسار المثالي: **بعد خريطة الحقول** (الخطوة 3) ليُمسك التبادل
قبل أن تعمل أدوات التوحيد على عمود خاطئ، و**قبل الرفع** (الخطوة 7) على
`03-output/students.csv`.

رمز الخروج 1 عند أي مانع، فلا يمرّ ملفٌّ معطوب في سكربت متسلسل. `--force`
يتجاوز الشبهة (لا الأخطاء القاطعة) حين تكون قد راجعتها بنفسك.

    python3 preflight.py --in 03-output/students.csv
    python3 preflight.py --in 02-work/mapped.csv --report 04-reports/preflight.csv
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from _common import HEADER_ALIASES, canon_header, dump_dicts, is_blank, map_columns, read_records

EGYPT_PHONE_RE = re.compile(r"^(?:\+20|0)1[0125]\d{8}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
LETTER_RE = re.compile(r"[^\W\d_]", re.UNICODE)

# أقل عدد قيم غير فارغة يُبنى عليه حكم. ثلاث قيم لا تكفي لوصف عمود.
MIN_SAMPLE = 5
# نسبة تجعل «العمود يشبه شيئًا آخر» شبهةً لا صدفة.
SUSPICION = 0.6


def shape_of(values: list[str]) -> dict[str, float]:
    """نِسب الأشكال في عمود — أساسُ مقارنة الاسم بالمحتوى."""
    n = len(values)
    if not n:
        return {}
    digits = [re.sub(r"\D", "", v) for v in values]
    return {
        "phone": sum(1 for v in values if EGYPT_PHONE_RE.match(v.strip())) / n,
        "nid14": sum(1 for d in digits if len(d) == 14) / n,
        "email": sum(1 for v in values if EMAIL_RE.match(v.strip())) / n,
        "letters": sum(1 for v in values if LETTER_RE.search(v)) / n,
        "numeric": sum(1 for v, d in zip(values, digits)
                       if d and len(d) >= len(v.replace(" ", "")) / 2) / n,
    }


# ما يُتوقَّع في كل حقل، وما يعنيه أن يبدو العمود كشيء آخر.
EXPECTED = {
    "name": ("letters", "أسماء"),
    "guardianName": ("letters", "أسماء"),
    "phone": ("phone", "هواتف مصرية"),
    "guardianPhone": ("phone", "هواتف مصرية"),
    "nationalId": ("nid14", "أرقام قومية من 14 خانة"),
    "guardianEmail": ("email", "عناوين بريد"),
}


def main() -> int:
    ap = argparse.ArgumentParser(description="فحص الملف قبل الرفع: الشكل والمحتوى")
    ap.add_argument("--in", dest="src", required=True, type=Path)
    ap.add_argument("--report", type=Path, default=None)
    ap.add_argument("--encoding", default="auto")
    ap.add_argument("--delimiter", default="auto", choices=["auto", ",", "\t"])
    ap.add_argument("--force", action="store_true",
                    help="امضِ رغم الشبهات (لا يتجاوز الأخطاء القاطعة)")
    args = ap.parse_args()

    header, body, delim = read_records(args.src, args.encoding, args.delimiter)
    rows = [r for r in body if not is_blank(r)]
    cols = map_columns(header)

    fatal: list[str] = []
    suspicious: list[str] = []
    notes: list[str] = []
    report: list[dict[str, str]] = []

    # ---------------------------------------------------------------- الشكل
    if "name" not in cols:
        fatal.append("لا عمود اسم يتعرّف عليه المستورد — سيرفض الملف كله. "
                     "أضف رأسًا مثل «الاسم» أو «name».")
    if not rows:
        fatal.append("رأس بلا صفوف.")

    known = set(cols.values())
    unknown = [h for i, h in enumerate(header) if i not in known and h.strip()]
    if unknown:
        # ليست مشكلة: المستورد يتجاهلها، وعمود الكود القديم يُبقى عمدًا ليُبنى
        # منه جدول الربط. لكن سكوتنا عنها يجعل عمودًا مُساء تسميته يبدو مقروءًا.
        notes.append(f"{len(unknown)} عمودًا لا يقرؤه المستورد ويتجاهله: "
                     + "، ".join(f"«{h}»" for h in unknown[:8])
                     + ("…" if len(unknown) > 8 else ""))

    seen: dict[str, list[str]] = {}
    for h in header:
        c = canon_header(h)
        for field, aliases in HEADER_ALIASES.items():
            if c in aliases:
                seen.setdefault(field, []).append(h)
    for field, hs in seen.items():
        if len(hs) > 1:
            suspicious.append(f"عمودان يقرؤهما المستورد كـ«{field}»: "
                              + "، ".join(f"«{h}»" for h in hs)
                              + " — الأول يفوز والثاني يُهمل بصمت.")

    ragged = sum(1 for r in rows if len(r) > len(header))
    if ragged:
        suspicious.append(f"{ragged} صفًا فيه خانات أكثر من عناوين الرأس — "
                          "غالبًا فاصلة داخل خانة غير مقتبسة، والأعمدة تنزلق بعدها.")

    # -------------------------------------------------------------- المحتوى
    for field, idx in sorted(cols.items()):
        values = [r[idx].strip() for r in rows if idx < len(r) and r[idx].strip()]
        filled = len(values)
        shape = shape_of(values)
        want, want_label = EXPECTED[field]
        got = shape.get(want, 0.0)

        report.append({
            "column": header[idx], "field": field,
            "filled": f"{filled}/{len(rows)}",
            "matches_expected": f"{got:.0%}",
            "expected": want_label,
        })

        if filled == 0:
            notes.append(f"«{header[idx]}» ({field}) فارغ تمامًا.")
            continue
        if filled < MIN_SAMPLE:
            notes.append(f"«{header[idx]}» فيه {filled} قيمة فقط — أقل من أن يُحكم عليه.")
            continue

        if got < SUSPICION:
            # ما الذي يشبهه العمود بدل ما يقوله اسمه؟
            other = max(((k, v) for k, v in shape.items()
                         if k != want and k != "numeric"), key=lambda kv: kv[1], default=None)
            label = {"phone": "هواتف مصرية", "nid14": "أرقام من 14 خانة",
                     "email": "عناوين بريد", "letters": "نصًّا"}
            if other and other[1] >= SUSPICION:
                suspicious.append(
                    f"«{header[idx]}» يُقرأ كـ{field} لكن {other[1]:.0%} من قيمه "
                    f"{label.get(other[0], other[0])} لا {want_label} — "
                    "عمودان متبادلان على الأرجح."
                )
            else:
                notes.append(f"«{header[idx]}»: {got:.0%} فقط {want_label}.")

    if len(rows) > 1000:
        notes.append(f"{len(rows)} صفًا — ارفعه بالواجهة أو بـimport_students.py "
                     "(كلاهما يقسّمه إلى دفعات من 20)، لا باستدعاء API واحد.")

    dump_dicts(args.report,
               ["column", "field", "filled", "matches_expected", "expected"], report)

    # ---------------------------------------------------------------- الخرج
    print(f"\n{args.src.name}: {len(rows)} صفًا × {len(header)} عمودًا "
          f"(فاصل: {'TAB' if delim == chr(9) else 'فاصلة'})")
    found = "، ".join(sorted(cols)) or "لا شيء"
    print(f"أعمدة يقرؤها المستورد: {found}")
    for r in report:
        print(f"    {r['column'][:24]:<26} {r['field']:<14} "
              f"مملوء {r['filled']:<10} مطابق للمتوقَّع {r['matches_expected']}")

    for n in notes:
        print(f"\nℹ️  {n}")
    for s in suspicious:
        print(f"\n⚠️  {s}", file=sys.stderr)
    for f in fatal:
        print(f"\n❌ {f}", file=sys.stderr)

    if fatal:
        return 1
    if suspicious and not args.force:
        print("\n🔴 راجع ما سبق قبل الرفع. إن كنت متأكدًا فأعد التشغيل بـ--force.",
              file=sys.stderr)
        return 1
    print("\n✅ الملف صالح للرفع.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
