#!/usr/bin/env python3
"""
import_students.py — رفع ملف الطلاب إلى المنصة، وحفظ نتيجته.

الواجهة تكفي لملف صغير، لكنها تتطلب إنسانًا يضغط ويظل واقفًا حتى تنتهي عشرون
دفعة، ولا تعطي نتيجةً يقرؤها حاسوب إلا بضغطة تنزيل يدوية. هذا السكربت يفعل نفس
الشيء بالضبط من الطرفية ويكتب `import-response.json` مباشرةً.

يقلّد سلوك الواجهة حرفًا بحرف، وليس ذلك تجميلًا:

  * **عشرون صفًا لكل طلب.** الحد ليس ضبطًا بل صحّة: كل صف معاملة قاعدة بيانات
    و~8 ذهابات وإيابات، وملفٌّ كامل في طلب واحد يتجاوز حدَّ تنفيذ الدالة
    السحابية ومهلةَ العميل معًا.
  * **`lineOffset` عامّ.** كل دفعة ملفُّ CSV مستقل يبدأ ترقيمه من 2، فبدون
    الإزاحة يُبلَّغ عن الصف 250 في كشف العميل بأنه «السطر 4». الإزاحة تُحسب
    بعد **حذف الأسطر الفارغة**، وهو ما تفعله الواجهة بالضبط — واختلافُ سطر
    واحد يجعل جدول الربط كله يشير إلى أطفال آخرين.
  * **بالتتابع لا بالتوازي.** الرفع المتوازي يجعل طالبين متطابقين يمرّان من
    فحص التكرار في نفس اللحظة.

قواعد أمان في السكربت نفسه:

  * **المعاينة أولًا وإجبارًا.** بلا `--commit` لا يُكتب شيء (`dryRun: true`).
  * **يتوقف عند أول فشل** — والدفعات التي نجحت تبقى مكتوبة، **فيُحفظ الردّ
    الجزئي على أي حال**. تلك الصفوف موجودة في قاعدة البيانات ولا شيء آخر
    يسجّل أيها. إعادة التشغيل آمنة: المستورد يُعيد استخدام من أُنشئ.
  * **لا يمسّ كلمات مرور.** المصادقة بكوكي جلسة قائمة تنسخها أنت من المتصفح؛
    لا يطلب السكربت كلمة مرور ولا يخزّنها ولا يسجّل قيمة الكوكي في أي مخرَج.

الحصول على الكوكي: افتح المنصة وسجّل الدخول بحساب **مالك أو مدير مركز**
(الاستقبال ممنوع من هذا المسار عمدًا)، ثم من أدوات المطوّر:
Application ← Cookies ← انسخ قيمة `edura.session_token`.

    export EDURA_SESSION_COOKIE='...'
    python3 import_students.py --in 03-output/students.csv --base-url https://app.edura.eg

    # التنفيذ الفعلي
    python3 import_students.py --in 03-output/students.csv --base-url https://app.edura.eg \\
        --commit --out-response 04-reports/import-response.json
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

from _common import map_columns, read_records, read_text

CHUNK_ROWS = 20
ENDPOINT = "/api/v1/center/students/import"

TEACHER_ENDPOINT = "/api/v1/teacher/temp-students"
EGYPT_PHONE_RE = re.compile(r"^(?:\+20|0)1[0125]\d{8}$")

DEFAULT_COOKIE_NAME = "edura.session_token"


def split_records(text: str) -> tuple[str, list[str]]:
    """
    (الرأس, الصفوف غير الفارغة) — بتقسيم يحترم الاقتباس.

    السطر الجديد داخل خانة مقتبسة (اسم وليّ أمر متعدد الأسطر) ليس نهاية سجل،
    وتقسيمُه يمزّق الصف بين طلبين.
    """
    lines: list[str] = []
    current = ""
    in_quotes = False
    for ch in text.replace("﻿", ""):
        if ch == '"':
            in_quotes = not in_quotes
        if ch == "\n" and not in_quotes:
            lines.append(current.rstrip("\r"))
            current = ""
            continue
        current += ch
    if current.strip():
        lines.append(current.rstrip("\r"))
    if not lines:
        raise SystemExit("الملف فارغ")
    return lines[0], [ln for ln in lines[1:] if ln.strip()]


def cookie_header(raw: str, name: str) -> str:
    """يقبل `name=value` كما يُنسخ من المتصفح، أو القيمة وحدها."""
    return raw.strip() if "=" in raw else f"{name}={raw.strip()}"


def post_chunk(base: str, cookie: str, payload: dict, timeout: int) -> dict:
    req = urllib.request.Request(
        base.rstrip("/") + ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "cookie": cookie,
            "accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            body = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            msg = json.loads(raw).get("error", {}).get("message", raw)
        except Exception:
            msg = raw
        if e.code in (401, 403):
            raise SystemExit(
                f"رُفض الطلب ({e.code}): {msg}\n"
                "الكوكي منتهٍ أو لحساب لا يملك الصلاحية. هذا المسار لمالك المركز "
                "أو المدير — والاستقبال ممنوع منه عمدًا."
            )
        raise RuntimeError(f"HTTP {e.code}: {msg}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"تعذّر الوصول إلى الخادم: {e.reason}")

    if "data" not in body:
        raise RuntimeError(f"ردٌّ بلا data: {str(body)[:200]}")
    return body["data"]


def merge(parts: list[dict], dry_run: bool) -> dict:
    out = {"dryRun": dry_run, "total": 0, "created": 0, "reused": 0,
           "duplicatesInFile": 0, "failed": 0, "rows": []}
    for p in parts:
        for k in ("total", "created", "reused", "duplicatesInFile", "failed"):
            out[k] += int(p.get(k, 0))
        out["rows"].extend(p.get("rows", []))
    return out



def post_one_teacher(base: str, cookie: str, body: dict, timeout: int) -> tuple[dict | None, str]:
    """طالب واحد. يعيد (البيانات, خطأ) — والخطأ نصٌّ للصف لا سببًا للتوقف."""
    req = urllib.request.Request(
        base.rstrip("/") + TEACHER_ENDPOINT,
        data=json.dumps(body).encode("utf-8"),
        headers={"content-type": "application/json", "cookie": cookie,
                 "accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode("utf-8")).get("data"), ""
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            msg = json.loads(raw).get("error", {}).get("message", raw)
        except Exception:
            msg = raw
        if e.code in (401, 403):
            raise SystemExit(
                f"رُفض الطلب ({e.code}): {msg}\n"
                "الكوكي منتهٍ أو لحساب ليس معلّمًا."
            )
        return None, f"HTTP {e.code}: {msg}"
    except urllib.error.URLError as e:
        raise RuntimeError(f"تعذّر الوصول إلى الخادم: {e.reason}")


def run_teacher(args, cookie: str) -> dict:
    header, body, _ = read_records(args.src)
    cols = map_columns(header)
    if "name" not in cols:
        raise SystemExit("لا عمود اسم معروف في الملف.")
    if "phone" not in cols:
        raise SystemExit(
            "لا عمود هاتف. وضع المعلّم يتطلبه: الخادم يفرضه على هذا الطريق، "
            "فطالب بلا هاتف لا يمكن رفعه أصلًا (استيراد المركز يقبله)."
        )
    name_i, phone_i = cols["name"], cols["phone"]
    grade_i = cols.get("grade")

    rows_out: list[dict] = []
    created = failed = 0
    records = [r for r in body if any(c.strip() for c in r)]
    print(f"\n{args.src.name}: {len(records)} صفًا — وضع المعلّم "
          f"({'تنفيذ فعلي' if args.commit else 'فحص محلي فقط'})")

    for i, row in enumerate(records):
        line = i + 2
        row = list(row) + [""] * (len(header) - len(row))
        name = row[name_i].strip()
        phone = row[phone_i].strip()

        problem = ""
        if not name:
            problem = "name_required"
        elif not EGYPT_PHONE_RE.match(phone):
            problem = "invalid_phone — إلزامي في وضع المعلّم"

        if problem:
            failed += 1
            rows_out.append({"line": line, "name": name, "status": "error",
                             "error": problem})
            continue
        if not args.commit:
            rows_out.append({"line": line, "name": name, "status": "would_create"})
            continue

        payload = {"fullName": name, "phone": phone}
        if grade_i is not None and row[grade_i].strip():
            payload["grade"] = row[grade_i].strip()
        data, err = post_one_teacher(args.base_url, cookie, payload, args.timeout)
        if err:
            failed += 1
            rows_out.append({"line": line, "name": name, "status": "error", "error": err})
        else:
            created += 1
            rows_out.append({"line": line, "name": name, "status": "created",
                             "studentId": (data or {}).get("id"),
                             "studentCode": (data or {}).get("studentCode")})
        if (i + 1) % 20 == 0:
            print(f"  {i + 1}/{len(records)}", flush=True)

    return {"dryRun": not args.commit, "total": len(records),
            "created": 0 if not args.commit else created,
            "reused": 0, "duplicatesInFile": 0, "failed": failed, "rows": rows_out}


def main() -> int:
    ap = argparse.ArgumentParser(description="رفع ملف الطلاب إلى المنصة وحفظ نتيجته")
    ap.add_argument("--in", dest="src", required=True, type=Path)
    ap.add_argument("--base-url", default=os.environ.get("EDURA_BASE_URL", "http://localhost:3002"))
    ap.add_argument("--cookie", default=os.environ.get("EDURA_SESSION_COOKIE"),
                    help="كوكي الجلسة: انسخ `name=value` كاملًا من المتصفح (أضمن)، "
                         "أو القيمة وحدها مع --cookie-name. الأفضل عبر "
                         "EDURA_SESSION_COOKIE حتى لا تدخل سجلَّ الأوامر")
    ap.add_argument("--cookie-name", default=DEFAULT_COOKIE_NAME,
                    help=f"افتراضيًا {DEFAULT_COOKIE_NAME}؛ وعلى dev يُلحق بالمنفذ "
                         "(edura-3002.session_token). يُهمَل إذا نسخت name=value")
    ap.add_argument("--commit", action="store_true",
                    help="نفّذ فعلًا. بدونه معاينة لا تكتب شيئًا")
    ap.add_argument("--out-response", type=Path, default=None,
                    help="مسار حفظ الردّ المدموج — وهو ما يقرؤه reconcile.py")
    ap.add_argument("--mode", choices=["center", "teacher"], default="center",
                    help="center = الاستيراد الجماعي (مالك/مدير مركز). "
                         "teacher = معلّم مستقل: لا استيراد جماعي له، فيُرفع "
                         "طالب لكل طلب عبر temp-students")
    ap.add_argument("--chunk", type=int, default=CHUNK_ROWS)
    ap.add_argument("--timeout", type=int, default=120)
    args = ap.parse_args()

    if not args.cookie:
        raise SystemExit(
            "لا كوكي جلسة. سجّل الدخول كمالك/مدير مركز، ثم:\n"
            "    export EDURA_SESSION_COOKIE='<name=value من المتصفح>'"
        )
    if args.commit and not args.out_response:
        raise SystemExit(
            "‏--commit يستلزم --out-response: الردّ هو المكان الوحيد الذي يربط "
            "صفًّا في كشف العميل بكود الطالب الذي أنشأته المنصة، ولا يُسترجع لاحقًا."
        )

    cookie = cookie_header(args.cookie, args.cookie_name)

    if args.mode == "teacher":
        merged = run_teacher(args, cookie)
        if args.out_response and args.commit:
            args.out_response.parent.mkdir(parents=True, exist_ok=True)
            args.out_response.write_text(
                json.dumps(merged, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"\nالردّ: {args.out_response}")
        print(f"\nالمجموع {merged['total']}  |  أُنشئ {merged['created']}  |  "
              f"فشل {merged['failed']}")
        if not args.commit:
            print("\n⚠️  هذا فحص محلي فقط — لا معاينة على الخادم في طريق المعلّم، "
                  "بخلاف استيراد المركز. لم يُسأل الخادم عن شيء.")
        return 1 if merged["failed"] and args.commit else 0

    header, rows = split_records(read_text(args.src))
    if not rows:
        raise SystemExit("الملف فيه رأس بلا صفوف")

    chunks = [(i, "\n".join([header, *rows[i:i + args.chunk]]))
              for i in range(0, len(rows), args.chunk)]
    mode = "تنفيذ فعلي" if args.commit else "معاينة (لا يُكتب شيء)"
    print(f"\n{args.src.name}: {len(rows)} صفًا في {len(chunks)} دفعة — {mode}")
    print(f"الخادم: {args.base_url}")

    parts: list[dict] = []
    failure: str | None = None
    for n, (offset, csv_text) in enumerate(chunks, start=1):
        try:
            parts.append(post_chunk(args.base_url, cookie, {
                "csv": csv_text,
                "dryRun": not args.commit,
                "lineOffset": offset,
            }, args.timeout))
        except RuntimeError as e:
            failure = f"الدفعة {n}/{len(chunks)} (الأسطر {offset + 2}…): {e}"
            break
        done = sum(p.get("total", 0) for p in parts)
        print(f"  دفعة {n}/{len(chunks)}  —  {done}/{len(rows)} صفًا", flush=True)

    merged = merge(parts, not args.commit)

    if args.out_response and parts:
        args.out_response.parent.mkdir(parents=True, exist_ok=True)
        args.out_response.write_text(
            json.dumps(merged, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"\nالردّ: {args.out_response}")

    print(f"\nالمجموع {merged['total']}  |  أُنشئ {merged['created']}  |  "
          f"أُعيد استخدامه {merged['reused']}  |  مكرر {merged['duplicatesInFile']}  |  "
          f"فشل {merged['failed']}")

    if failure:
        print(f"\n🔴 توقّف: {failure}", file=sys.stderr)
        if args.commit:
            print(f"الدفعات التي مرّت كُتبت فعلًا ({merged['total']} صفًا) وردُّها "
                  "محفوظ. أصلح السبب وأعد تشغيل الملف نفسه: المستورد يُعيد "
                  "استخدام من أُنشئ ولا يكرّره.", file=sys.stderr)
        return 1

    if not args.commit:
        print("\nمعاينة فقط. راجع الأرقام، ثم أضف --commit و--out-response.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
