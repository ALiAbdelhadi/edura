#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
normalize_contacts.py — توحيد أرقام الهواتف والرقم القومي في ملف طلاب قبل استيراده
إلى Edura.

لماذا يوجد هذا السكربت (السبب من الكود لا من الرأي):

  * المستورد لا يتحقق من صيغة الهاتف إطلاقًا — يخزّنه كما هو بعد trim
    (`student-csv.ts`)، بينما المطابقة مقارنة نصية حرفية
    (`findStudentByKeys` في manual-students.ts) و `users.phone` فريد عالميًا،
    وباقي المنصة يفرض `^(?:\\+20|0)1[0125]\\d{8}$`. فـ `+201012345678` و
    `01012345678` طالبان مختلفان لن يُدمجا أبدًا.
  * الرقم القومي: المستورد يحذف غير الأرقام ثم يرفض **الصف كله** إن لم يكن
    الطول 14 بالضبط. فرقم قومي فاسد لا يفسد نفسه — بل يُسقط طالبًا سليمًا.

ما لا يفعله هذا السكربت، عمدًا:

  * لا يخترع بيانات. الرقم الذي لا يصل إلى صيغة صحيحة **لا يُخمَّن**.
  * لا يحذف صفًا. عدد صفوف الخرج = عدد صفوف الدخل، ويُتحقق من ذلك في النهاية.
  * لا يوسّع الترميز العلمي (1.01234568E+10) حين يكون قد فقد خانات — توسيعه
    اختراعُ رقم. يُبلَّغ عنه ويُطلب إعادة تصدير العمود كنص.
  * لا يصحّح الأسماء إملائيًا.
  * لا يمس المال أو أي شيء خارج ملف الـCSV الذي أعطيته له.

يعتمد على المكتبة القياسية وحدها. **بلا pandas عمدًا**: pandas يقرأ عمود
الهاتف كرقم عشري فيحوّل 01012345678 إلى 1012345678.0 — وهو نفس العطب الذي
كُتب هذا الملف لإصلاحه.

الاستخدام:

    python3 normalize_contacts.py \\
        --in  01-source/students.csv \\
        --out 03-output/students.csv \\
        --report 04-reports/normalize-report.csv

    # مراجعة بلا كتابة (افتراضي عند إغفال --out)
    python3 normalize_contacts.py --in 01-source/students.csv --report -

الخيارات المهمة:
    --invalid-phone {blank,keep}   ماذا يُكتب في خانة هاتف طالب تعذّر توحيدها.
                                   الافتراضي blank، والسبب مشروح عند STRICT أدناه.
    --pick-first-of-multiple       خانة تحوي أكثر من رقم: خذ أول رقم صحيح.
                                   مطفأ افتراضيًا — أيّ الرقمين للطالب قرارُ بشر.
"""

from __future__ import annotations

import argparse
import re
import sys
from decimal import Decimal
from pathlib import Path

# المشترك (جدول أسماء الأعمدة، قراءة الملفات) يعيش في ملف واحد — ثلاث نسخ
# منه تعني ثلاثة تعريفات لـ«عمود الهاتف» حرةً في أن تختلف.
from _common import (
    INVISIBLE,
    dump_dicts,
    is_blank,
    map_columns,
    read_records,
    write_csv,
)

# الصيغة التي تفرضها المنصة على كل شاشة تسجيل ودخول
# (EGYPT_PHONE_RE في packages/server-core/src/validation/common.ts).
EGYPT_MOBILE_RE = re.compile(r"^01[0125]\d{8}$")

# أرقام عربية-هندية (٠-٩) وفارسية (۰-۹) → لاتينية.
DIGIT_MAP = {ord(c): str(i) for i, c in enumerate("٠١٢٣٤٥٦٧٨٩")}
DIGIT_MAP.update({ord(c): str(i) for i, c in enumerate("۰۱۲۳۴۵۶۷۸۹")})


SCIENTIFIC_RE = re.compile(r"^\s*(\d)(?:[.,](\d+))?\s*[eE]\s*\+?\s*(\d+)\s*$")

# أكواد المحافظات في الرقم القومي المصري (الخانتان 8-9)، و88 = مولود بالخارج.
GOVERNORATES = {
    "01", "02", "03", "04", "11", "12", "13", "14", "15", "16", "17", "18",
    "19", "21", "22", "23", "24", "25", "26", "27", "28", "29", "31", "32",
    "33", "34", "35", "88",
}


# ---------------------------------------------------------------------------
# أدوات نصية
# ---------------------------------------------------------------------------
def clean_cell(raw: str) -> str:
    """إزالة العلامات غير المرئية وتحويل الأرقام إلى لاتينية، بلا تغيير آخر."""
    return raw.translate(INVISIBLE).translate(DIGIT_MAP).strip()


def expand_scientific(text: str) -> tuple[str | None, str | None]:
    """
    توسيع خانة كتبها Excel بالترميز العلمي — **فقط** إن كانت خاناتها المعنوية
    كافية لإعادة بناء الرقم بلا تخمين.

    1.01234568E+10 يعني 11 خانة بينما المحفوظ 9 خانات معنوية: الرقمان الأخيران
    فُقدا فعلًا، وتوسيعه يكتب رقمًا لم يكتبه أحد. نرفض ونطلب إعادة التصدير كنص.
    """
    m = SCIENTIFIC_RE.match(text)
    if not m:
        return None, None
    lead, frac, exp = m.group(1), m.group(2) or "", int(m.group(3))
    significant = len(lead) + len(frac)
    total_digits = exp + 1
    if significant < total_digits:
        return None, "unrecoverable_precision"
    return str(int(Decimal(f"{lead}.{frac}e{exp}"))) if frac else str(int(Decimal(f"{lead}e{exp}"))), None


def digit_runs(text: str) -> list[str]:
    """
    مرشّحو الأرقام في الخانة، **باستراتيجيتين** لأن المسافة هنا غامضة بطبعها:
    فهي فاصل داخل رقم واحد («0100 123 4567») وفاصل بين رقمين («0100… 0111…»).
    نُقدّم التسلسل كاملًا وأجزاءه المفصولة بمسافات، ويحكم التحققُ أيُّهما رقم
    صحيح — بدل أن نفترض معنى المسافة ونخسر إحدى الحالتين.
    """
    out: list[str] = []
    for run in re.findall(r"\+?\d[\d\s().\-]*", text):
        out.append(run)
        parts = run.split()
        if len(parts) > 1:
            out.extend(parts)
    return out


# ---------------------------------------------------------------------------
# الهاتف
# ---------------------------------------------------------------------------
def canonicalize_one_phone(token: str) -> str | None:
    """
    محاولة إيصال تسلسل أرقام واحد إلى الصيغة 01XXXXXXXXX. يعيد None إن لم يصل.
    كل خطوة هنا حذفُ بادئة معروفة أو إعادةُ صفر ابتلعه Excel — لا اختراع خانة.
    """
    d = re.sub(r"\D", "", token)
    if not d:
        return None
    if d.startswith("00"):            # 00201012345678
        d = d[2:]
    if len(d) == 12 and d.startswith("20"):   # 201012345678
        d = d[2:]
    if len(d) == 10 and d.startswith("1"):    # Excel ابتلع الصفر الأول
        d = "0" + d
    return d if EGYPT_MOBILE_RE.match(d) else None


def normalize_phone(raw: str, pick_first: bool) -> tuple[str, str, str]:
    """
    يعيد (القيمة_المقترحة, الحالة, ملاحظة).

    الحالات: empty / ok / fixed / picked / multiple / not_mobile /
             unrecoverable_precision

    `multiple` = خانة بأكثر من رقم لم يُحسم أمرها (تُترك للمراجعة).
    `picked`   = نفس الحالة لكن المشغّل طلب صراحةً أخذ الأول — حالة **محسومة**،
                 وتمييزها عن `multiple` ضروري: بلا هذا التمييز يمحو منطقُ
                 التفريغ أدناه الرقمَ الذي اختاره للتو.
    """
    text = clean_cell(raw)
    if not text:
        return "", "empty", ""

    expanded, sci_err = expand_scientific(text)
    if sci_err:
        return raw, "unrecoverable_precision", "خانة بترميز Excel العلمي فقدت خانات — أعد تصدير العمود كنص"
    if expanded:
        text = expanded

    candidates = [c for c in (canonicalize_one_phone(t) for t in digit_runs(text)) if c]
    unique = list(dict.fromkeys(candidates))

    if not unique:
        return raw, "not_mobile", "لا يطابق صيغة الموبايل المصري (01[0125] + 8 خانات)"
    if len(unique) > 1:
        if not pick_first:
            return raw, "multiple", "أكثر من رقم في خانة واحدة: " + " | ".join(unique)
        return unique[0], "picked", "أُخذ الأول من: " + " | ".join(unique)

    value = unique[0]
    return value, ("ok" if value == raw.strip() else "fixed"), ""


# ---------------------------------------------------------------------------
# الرقم القومي
# ---------------------------------------------------------------------------
def normalize_national_id(raw: str) -> tuple[str, str, str]:
    """
    يعيد (القيمة_المقترحة, الحالة, ملاحظة).

    الحالات: empty / ok / fixed / bad_length / suspect / unrecoverable_precision

    `suspect` **لا يُرفض**: المنصة تقبل أي 14 رقمًا، ورفضُ ما تقبله يعني إسقاط
    طالب قد يكون رقمه سليمًا. لكنه يُبلَّغ، لأن رقمًا قوميًا مخطئًا لا يُخزَّن
    خطأً فحسب — بل يحجز رقم إنسان آخر حجزًا دائمًا (العمود فريد عالميًا).
    """
    text = clean_cell(raw)
    if not text:
        return "", "empty", ""

    expanded, sci_err = expand_scientific(text)
    if sci_err:
        return raw, "unrecoverable_precision", "خانة بترميز Excel العلمي فقدت خانات — أعد تصدير العمود كنص"
    if expanded:
        text = expanded

    digits = re.sub(r"\D", "", text)
    if len(digits) != 14:
        return "", "bad_length", f"الطول {len(digits)} لا 14 — المستورد يرفض الصف كله بسببه"

    problems = []
    if digits[0] not in ("2", "3"):
        problems.append("خانة القرن ليست 2 أو 3")
    month, day = digits[3:5], digits[5:7]
    if not ("01" <= month <= "12"):
        problems.append("شهر الميلاد خارج 01-12")
    if not ("01" <= day <= "31"):
        problems.append("يوم الميلاد خارج 01-31")
    if digits[7:9] not in GOVERNORATES:
        problems.append("كود محافظة غير معروف")

    status = "suspect" if problems else ("ok" if digits == raw.strip() else "fixed")
    return digits, status, "؛ ".join(problems)


# ---------------------------------------------------------------------------
# التشغيل
# ---------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(
        description="توحيد الهواتف والرقم القومي في ملف طلاب قبل استيراده إلى Edura",
    )
    ap.add_argument("--in", dest="src", required=True, type=Path, help="ملف المصدر (CSV/TSV)")
    ap.add_argument("--out", type=Path, default=None,
                    help="ملف الخرج الجاهز للاستيراد. بلا هذا الخيار: مراجعة فقط، لا كتابة")
    ap.add_argument("--report", type=Path, default=None,
                    help="تقرير التغييرات صفًا صفًا (استخدم - للطباعة على الشاشة)")
    ap.add_argument("--encoding", default="auto")
    ap.add_argument("--delimiter", default="auto", choices=["auto", ",", "\t"])
    ap.add_argument("--invalid-phone", choices=["blank", "keep"], default="blank",
                    help="STRICT (افتراضي blank): هاتف الطالب مفتاح مطابقة وعمود فريد "
                         "عالميًا؛ قيمة فاسدة فيه تحجز مكان صاحبها الحقيقي وتمنع الأسرة "
                         "من الربط لاحقًا، بينما الطالب بلا هاتف حالة مقبولة وقابلة "
                         "للاستكمال. القيمة الأصلية تبقى في المصدر وفي التقرير.")
    ap.add_argument("--pick-first-of-multiple", action="store_true",
                    help="خانة فيها أكثر من رقم: خذ أول رقم صحيح بدل تركها للمراجعة")
    args = ap.parse_args()

    header, body, delim = read_records(args.src, args.encoding, args.delimiter)
    cols = map_columns(header)
    if "name" not in cols:
        raise SystemExit(
            "لا يوجد عمود اسم معروف — المستورد سيرفض الملف كله. "
            "أضف رأسًا مثل \"الاسم\" أو \"name\"."
        )

    # هاتف ولي الأمر يُعامَل بتساهل عن هاتف الطالب: ليس مفتاح مطابقة ولا عمودًا
    # فريدًا، وغرضه الاتصال بالبيت. أرضي ثابت أن يبقى رقم أرضي صالح للاتصال على
    # أن يُمحى لأنه ليس موبايل.
    targets = [
        ("phone", cols.get("phone"), "student"),
        ("guardianPhone", cols.get("guardianPhone"), "guardian"),
        ("nationalId", cols.get("nationalId"), "nid"),
    ]
    missing = [f for f, i, _ in targets if i is None]
    if missing:
        print(f"ℹ️  أعمدة غير موجودة في الملف (لا شيء ليُوحَّد فيها): {', '.join(missing)}",
              file=sys.stderr)

    name_idx = cols["name"]
    report_rows: list[dict[str, str]] = []
    counters: dict[str, int] = {}
    out_body: list[list[str]] = []

    for i, row in enumerate(body):
        line = i + 2  # ترقيم المستورد: الرأس سطر 1
        if is_blank(row):
            out_body.append(row)          # صف فارغ يُمرَّر كما هو؛ المستورد يتخطاه
            continue
        row = list(row) + [""] * (len(header) - len(row))  # لا نقص خانات
        name = row[name_idx].strip() if name_idx < len(row) else ""

        for field, idx, kind in targets:
            if idx is None or idx >= len(row):
                continue
            original = row[idx]
            if kind == "nid":
                value, status, note = normalize_national_id(original)
            else:
                value, status, note = normalize_phone(original, args.pick_first_of_multiple)
                if status in ("not_mobile", "multiple", "unrecoverable_precision"):
                    # الطالب: STRICT حسب الخيار. وليّ الأمر: نُبقي الأصل دائمًا.
                    keep = (kind == "guardian") or (args.invalid_phone == "keep")
                    value = original.strip() if keep else ""

            counters[f"{field}:{status}"] = counters.get(f"{field}:{status}", 0) + 1
            if status != "empty" and (value != original or status not in ("ok",)):
                report_rows.append({
                    "line": str(line), "name": name, "field": field,
                    "original": original, "normalized": value,
                    "status": status, "note": note,
                })
            row[idx] = value

        out_body.append(row)

    # تكرارات ظهرت بعد التوحيد: صفّان كانا يبدوان مختلفين وصارا مفتاحًا واحدًا.
    dupes: list[str] = []
    for field in ("phone", "nationalId"):
        idx = cols.get(field)
        if idx is None:
            continue
        seen: dict[str, int] = {}
        for i, row in enumerate(out_body):
            if idx >= len(row):
                continue
            v = row[idx].strip()
            if not v:
                continue
            if v in seen:
                dupes.append(f"{field}: سطر {i + 2} يكرر سطر {seen[v]}")
            else:
                seen[v] = i + 2

    # ------------------------------------------------------------------
    # الضمانة: لا صف يُفقد. تُفحص قبل أي كتابة.
    # ------------------------------------------------------------------
    if len(out_body) != len(body):
        raise SystemExit(f"خلل داخلي: دخل {len(body)} صفًا وخرج {len(out_body)} — أوقفتُ الكتابة")

    if args.out:
        write_csv(args.out, header, out_body)

    dump_dicts(args.report,
               ["line", "name", "field", "original", "normalized", "status", "note"],
               report_rows)

    # ------------------------------------------------------------------
    # الملخص
    # ------------------------------------------------------------------
    print(f"\nالمصدر: {args.src}   (فاصل: {'TAB' if delim == chr(9) else 'فاصلة'})")
    print(f"صفوف الدخل: {len(body)}   صفوف الخرج: {len(out_body)}   ✅ لا صف مفقود")
    labels = {
        "ok": "سليم كما هو", "fixed": "وُحِّد", "empty": "فارغ",
        "not_mobile": "ليس موبايل مصري", "multiple": "أكثر من رقم (للمراجعة)",
        "picked": "أكثر من رقم — أُخذ الأول بطلبك",
        "bad_length": "طول خاطئ (يُفرَّغ وإلا رُفض الصف)",
        "suspect": "14 رقمًا لكن بنيته مريبة (يمر)",
        "unrecoverable_precision": "ترميز Excel العلمي — أعد التصدير كنص",
    }
    for field in ("phone", "guardianPhone", "nationalId"):
        keys = {k: v for k, v in counters.items() if k.startswith(field + ":")}
        if not keys:
            continue
        print(f"\n  {field}")
        for k, v in sorted(keys.items(), key=lambda kv: -kv[1]):
            status = k.split(":", 1)[1]
            print(f"    {labels.get(status, status):<42} {v}")

    if dupes:
        print(f"\n⚠️  {len(dupes)} تكرارًا بعد التوحيد (المستورد سيبلّغ عنها duplicate_in_file):")
        for d in dupes[:20]:
            print("    " + d)
        if len(dupes) > 20:
            print(f"    … و{len(dupes) - 20} غيرها في التقرير")

    needs_human = sum(v for k, v in counters.items()
                      if k.split(":", 1)[1] in ("not_mobile", "multiple", "bad_length",
                                                "suspect", "unrecoverable_precision"))
    if needs_human:
        print(f"\n🔴 {needs_human} خانة تحتاج قرار بشر — راجع التقرير قبل الاستيراد.")
    if not args.out:
        print("\n(مراجعة فقط — لم يُكتب ملف خرج. أضف --out عند الاقتناع.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
