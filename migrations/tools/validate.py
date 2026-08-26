#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
validate.py — الخطوة 6: تطبيق قواعد المنصة صفًا صفًا، وإنتاج ملف الاستيراد
وملف المرفوضات معًا.

هذه هي الأداة التي كانت ناقصة: `reconcile.py` يقرأ `rejected_*.csv` ومعادلة
الميزان تعتمد عليه، ولم يكن أحدٌ يكتبه — فكان الميزان ادّعاءً لا حسابًا.

المخرَجات:
  03-output/students.csv           الصفوف المقبولة، بنفس أعمدة الدخل
  04-reports/rejected_students.csv الصفوف المرفوضة + عمود `reason`
  04-reports/validation-report.csv كل تعديل أو ملاحظة صفًا صفًا

╔══════════════════════════════════════════════════════════════════════════╗
║  الرفض والتفريغ ليسا الشيء نفسه، والفرق بينهما هو التناسب:               ║
║    • ما يُسقط الصفَّ عند المستورد  →  يُرفض الصف هنا ويُسجَّل سببه.        ║
║    • ما يفسد خانةً واحدة           →  تُفرَّغ الخانة ويبقى الطالب.         ║
╚══════════════════════════════════════════════════════════════════════════╝

القواعد، وكلٌّ منها من الكود لا من الرأي:

1. **الاسم مطلوب.** `importStudents` يرمي «Name is required» ويُسقط الصف.
   ⇒ رفض (`name_required`).

2. **الرقم القومي 14 خانة بالضبط.** `normalizeNationalId` يرمي على أي طول آخر،
   و«الرقم القومي فاسد» يُسقط **الطالب كله** لا الرقم وحده.
   ⇒ رفض (`invalid_national_id`) — لا تفريغ. تفريغه هنا يعني استيراد طالب بلا
   أقوى مفاتيح المطابقة، وهو ما يُنتج الطفل المكرَّر بعد شهر.

3. **الهاتف: صيغة مصرية أو فارغ، ولا ثالث.** المستورد لا يتحقق من الصيغة،
   لكن `users.phone` فريد عالميًا والمطابقة نصية حرفية، وكل شاشات المنصة تفرض
   `^(?:\\+20|0)1[0125]\\d{8}$`. فرقمٌ مشوَّه يُخزَّن بنجاح ثم **يحجز مكان صاحبه
   الحقيقي** ويمنع الأسرة من الربط لاحقًا.
   ⇒ رفض (`invalid_phone`) — الصف يعود بعد تصحيح الرقم، وهو تصحيح يعرفه العميل.

4. **بريد وليّ الأمر: يُفرَّغ إن لم يكن بريدًا، ولا يُرفض الصف.**
   > وهذا البند ليس تنظيمًا للبيانات بل **أمانُ أطفال**. البوابة في
   > `packages/database/src/queries/chat-guardian.ts` تُقيَّم هكذا حرفيًا:
   >     `const hasGuardianChannel = viaParent || !!profile?.guardianEmail;`
   > أي نص غير فارغ يفتحها. فعمودٌ فيه «لا يوجد» أو «-» يفتح **مراسلة البالغين
   > لقاصر** على قناة لا وجود لها، بلا خطأ ظاهر يُنبّه أحدًا. الخانة الفارغة
   > تُبقي القفل مغلقًا، وهو الاتجاه الصحيح للخطأ.
   ⇒ تفريغ + تسجيل (`guardian_email_blanked`).

5. **التكرار داخل الملف لا يُرفض هنا.** المستورد نفسه يكشفه ويُبلّغ عنه
   `duplicate_in_file` مع رقم السطر الذي يكرره، وهو المرجع الوحيد لعدّه. رفضُه
   هنا يعني عدّادين للشيء نفسه، حرّين في أن يختلفا.

الاستخدام:

    # مراجعة فقط (افتراضي — لا يكتب شيئًا)
    python3 validate.py --in 02-work/students.clean.csv

    # التطبيق
    python3 validate.py \\
        --in  02-work/students.clean.csv \\
        --out 03-output/students.csv \\
        --rejected 04-reports/rejected_students.csv \\
        --report 04-reports/validation-report.csv

يُشغَّل **بعد** normalize_contacts.py و normalize_names.py، وقبل reconcile.py.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from _common import dump_dicts, is_blank, map_columns, read_records, write_csv

# نفس الصيغة التي تفرضها كل شاشة في المنصة
# (EGYPT_PHONE_RE في packages/server-core/src/validation/common.ts).
EGYPT_PHONE_RE = re.compile(r"^(?:\+20|0)1[0125]\d{8}$")

# متحفّظ عمدًا: هدفه استبعاد ما ليس بريدًا («لا يوجد»، «-»، «؟»)، لا الحكم على
# صحة نطاق. بريد خاطئ لا يصل؛ وأما نصٌّ ليس بريدًا أصلًا فيفتح بوابة أمان.
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")


def main() -> int:
    ap = argparse.ArgumentParser(
        description="تطبيق قواعد المنصة صفًا صفًا وإنتاج ملف الاستيراد والمرفوضات")
    ap.add_argument("--in", dest="src", required=True, type=Path)
    ap.add_argument("--out", type=Path, default=None,
                    help="ملف الاستيراد (المقبول). بلا هذا الخيار: مراجعة فقط")
    ap.add_argument("--rejected", type=Path, default=None,
                    help="ملف المرفوضات + عمود reason — وهو ما يقرؤه reconcile.py")
    ap.add_argument("--report", type=Path, default=None)
    ap.add_argument("--encoding", default="auto")
    ap.add_argument("--delimiter", default="auto", choices=["auto", ",", "\t"])
    ap.add_argument("--keep-bad-phone", action="store_true",
                    help="أبقِ الصف ذا الهاتف المشوَّه بعد **تفريغ** هاتفه بدل رفضه. "
                         "استعمله حين يكون الاسم وحده مطلوبًا ولا سبيل لتصحيح "
                         "الأرقام؛ وتذكّر أن الطالب يفقد حينها مفتاح المطابقة.")
    args = ap.parse_args()

    header, body, _ = read_records(args.src, args.encoding, args.delimiter)
    cols = map_columns(header)
    if "name" not in cols:
        raise SystemExit("لا يوجد عمود اسم معروف — المستورد سيرفض الملف كله.")

    name_i = cols["name"]
    phone_i = cols.get("phone")
    nid_i = cols.get("nationalId")
    gmail_i = cols.get("guardianEmail")
    missing = [f for f, i in (("phone", phone_i), ("nationalId", nid_i),
                              ("guardianEmail", gmail_i)) if i is None]
    if missing:
        print(f"ℹ️  أعمدة غير موجودة (لا قاعدة تُطبَّق عليها): {'، '.join(missing)}",
              file=sys.stderr)

    accepted: list[list[str]] = []
    rejected: list[list[str]] = []
    report: list[dict[str, str]] = []
    counts: dict[str, int] = {}
    blank_rows = 0

    def bump(k: str) -> None:
        counts[k] = counts.get(k, 0) + 1

    for i, row in enumerate(body):
        line = i + 2  # ترقيم المستورد: الرأس سطر 1
        if is_blank(row):
            blank_rows += 1
            continue
        row = list(row) + [""] * (len(header) - len(row))
        name = row[name_i].strip()

        reason = ""
        if not name:
            reason = "name_required — الاسم فارغ، والمستورد يُسقط الصف"
        elif nid_i is not None and row[nid_i].strip():
            digits = re.sub(r"\D", "", row[nid_i])
            if len(digits) != 14:
                reason = (f"invalid_national_id — {len(digits)} خانة لا 14؛ "
                          "المستورد يرفض الصف كله بسببه")
            elif digits != row[nid_i].strip():
                row[nid_i] = digits
                report.append({"line": str(line), "name": name, "field": "nationalId",
                               "action": "normalized", "value": digits,
                               "note": "حُذف ما ليس رقمًا"})
                bump("nid_normalized")

        if not reason and phone_i is not None and row[phone_i].strip():
            phone = row[phone_i].strip()
            if not EGYPT_PHONE_RE.match(phone):
                if args.keep_bad_phone:
                    row[phone_i] = ""
                    report.append({"line": str(line), "name": name, "field": "phone",
                                   "action": "blanked", "value": phone,
                                   "note": "هاتف مشوَّه؛ فُرِّغ بطلبك — الطالب بلا "
                                           "مفتاح مطابقة الآن"})
                    bump("phone_blanked")
                else:
                    reason = ("invalid_phone — لا يطابق 01[0125] + 8 خانات؛ "
                              "رقم مشوَّه يحجز عمودًا فريدًا باسم إنسان آخر")

        # بريد وليّ الأمر: يُفرَّغ ولا يُرفض — الصف سليم والخانة وحدها فاسدة.
        if not reason and gmail_i is not None and row[gmail_i].strip():
            gmail = row[gmail_i].strip()
            if not EMAIL_RE.match(gmail):
                row[gmail_i] = ""
                report.append({"line": str(line), "name": name, "field": "guardianEmail",
                               "action": "blanked", "value": gmail,
                               "note": "ليس بريدًا؛ ولو مرّ لفتح مراسلة البالغين "
                                       "لقاصر على قناة لا وجود لها"})
                bump("guardian_email_blanked")

        if reason:
            rejected.append(row + [reason])
            bump(reason.split(" ")[0])
        else:
            accepted.append(row)

    # ------------------------------------------------------------------
    # الضمانة: كل صف غير فارغ إما مقبول أو مرفوض — لا ثالث ولا ضائع.
    # ------------------------------------------------------------------
    total = len(body) - blank_rows
    if len(accepted) + len(rejected) != total:
        raise SystemExit(
            f"خلل داخلي: {total} صفًا دخل، و{len(accepted)} مقبولًا + "
            f"{len(rejected)} مرفوضًا — أوقفتُ الكتابة")

    if args.out:
        write_csv(args.out, header, accepted)
        # الحد 1000 صف **لكل استدعاء API** لا لكل ملف، والواجهة و
        # `import_students.py` كلاهما يرسل 20 صفًا في الطلب — فالحد لا يُبلَغ
        # منهما مهما كبر الملف. لا يُقسَّم الملف هنا عمدًا: أجزاءٌ تُرفع
        # منفصلةً يستأنف ترقيمُ أسطر كلٍّ منها من 2، فتتصادم أرقام الأسطر
        # وينهار الربط بين الردّ وصفوف الملف — أي أن التقسيم يُفسد جدول الربط
        # لحلّ مشكلة غير قائمة.
        if len(accepted) > 1000:
            print(f"\nℹ️  {len(accepted)} صفًا. ارفعه بالواجهة أو بـ"
                  "`import_students.py` — كلاهما يقسّمه إلى دفعات من 20 تلقائيًا. "
                  "ولا ترسله في استدعاء API واحد: الحد 1000 صف للاستدعاء.")
    if args.rejected and rejected:
        write_csv(args.rejected, header + ["reason"], rejected)
    elif args.rejected:
        # ملف برأس بلا صفوف: `reconcile.py` يقرؤه فيرى صفرًا. غيابُ الملف
        # يُقرأ كنسيان، ووجوده فارغًا يقول «فُحص ولم يُرفض شيء».
        write_csv(args.rejected, header + ["reason"], [])
    dump_dicts(args.report, ["line", "name", "field", "action", "value", "note"], report)

    # ------------------------------------------------------------------
    print(f"\nالمصدر: {args.src}")
    print(f"صفوف غير فارغة: {total}   →   مقبول {len(accepted)} + مرفوض "
          f"{len(rejected)}   ✅ متزن")
    if blank_rows:
        print(f"صفوف فارغة متخطاة: {blank_rows}")
    labels = {
        "name_required": "الاسم فارغ (رفض)",
        "invalid_national_id": "رقم قومي ليس 14 خانة (رفض)",
        "invalid_phone": "هاتف لا يطابق الصيغة المصرية (رفض)",
        "guardian_email_blanked": "بريد وليّ أمر ليس بريدًا (فُرِّغ)",
        "phone_blanked": "هاتف مشوَّه فُرِّغ (بطلبك)",
        "nid_normalized": "رقم قومي حُذف منه ما ليس رقمًا",
    }
    for k, v in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"    {labels.get(k, k):<44} {v}")

    if counts.get("guardian_email_blanked"):
        print("\n🔒 بريد وليّ الأمر: التفريغ يُبقي قفل مراسلة البالغين مغلقًا على "
              "القاصر، وهو الاتجاه الصحيح للخطأ. اطلب العناوين الصحيحة من العميل "
              "بدل تمرير نصوص مكان البريد.")
    if rejected:
        print(f"\n🔴 {len(rejected)} صفًا مرفوضًا — أرسل الملف للعميل لاستكماله. "
              "كل صف يعود بمجرد إصلاح سببه.")
    if not args.out:
        print("\n(مراجعة فقط — لم يُكتب ملف. أضف --out و--rejected عند الاقتناع.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
