#!/usr/bin/env python3
"""
reconcile.py — المطابقة النهائية وتقرير الترحيل (الخطوتان 8 و9).

هذا هو الملف الذي يقول: **لم يضع صف واحد**. وهو يقولها بالحساب لا بالثقة، ويخرج
برمز فشل (exit 1) عند أول فرق — لأن تقريرًا يُظهر خللًا ثم يمرّ بهدوء ليس تقريرًا.

يعمل في طَورين، ويُشغَّل في كليهما:

  الطَور الأول — قبل الاستيراد (بلا --response):
      صفوف المصدر = صفوف ملف الاستيراد + المرفوضة + الفارغة

  الطَور الثاني — بعد الاستيراد (مع --response):
      لكل دفعة:  created + reused + duplicate_in_file + failed = total
      ومجموع الدفعات = صفوف ملف الاستيراد
      وكل سطر مُبلَّغ عنه مرة واحدة بالضبط — لا فجوة ولا ازدواج

╔══════════════════════════════════════════════════════════════════════════╗
║  الربط بين ردّ الاستيراد وصفوف الملف ليس افتراضًا — إنه مُتحقَّق منه.      ║
╚══════════════════════════════════════════════════════════════════════════╝

الردّ يحمل رقم سطر، والواجهة تحسبه بعد **حذف الأسطر الفارغة**
(student-import-dialog.tsx: `dataLines.filter(l => l.trim() !== "")`)، فالسطر
المُبلَّغ ليس السطر الفعلي في ملف به فراغات وسطى. نعيد بناء نفس الرؤية بالضبط،
ثم — وهذا هو الأمان الحقيقي — **نقارن الاسم في الردّ بالاسم في الصف**. اختلافُ
اسم يعني أن الربط منزلق، وأن جدول الربط (crosswalk) سيكون هراءً موثّقًا. عندها
يتوقف السكربت بدل أن يُخرج ملفًا يبدو سليمًا.

جدول الربط `crosswalk.csv` هو المخرَج الذي يبقى: كود الطالب القديم عند العميل ↔
كود Edura الجديد. لا يوجد عمود لكود العميل القديم في المنصة، فهذا الملف هو
الشيء الوحيد الذي يسمح بالتحقق من صف واحد بعد شهر. **أبقِ عمود الكود القديم في
ملف الاستيراد** — المستورد يتجاهل الأعمدة غير المعروفة، فوجوده مجاني ووجوده هو
ما يجعل هذا الجدول ممكنًا.

الاستخدام:

    # قبل الاستيراد
    python3 reconcile.py \\
        --source 01-source/students.csv \\
        --import-file 03-output/students.csv \\
        --rejected 04-reports/rejected_students.csv \\
        --out-dir 04-reports

    # بعد الاستيراد
    python3 reconcile.py \\
        --source 01-source/students.csv \\
        --import-file 03-output/students.csv \\
        --rejected 04-reports/rejected_students.csv \\
        --response 04-reports/import-response.json \\
        --legacy-id-column "كود الطالب" \\
        --contacts-report 04-reports/normalize-report.csv \\
        --names-report 04-reports/names-report.csv \\
        --out-dir 04-reports
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import sys
from datetime import date
from pathlib import Path

from _common import (
    INVISIBLE,
    canon_header,
    dump_dicts,
    is_blank,
    map_columns,
    read_records,
    read_text,
)

RESOLVED = {"created", "reused", "would_create", "would_reuse"}


def norm_name(s: str) -> str:
    """تطبيع خفيف للمقارنة وحدها — لا يُكتب في أي مكان."""
    return " ".join(s.translate(INVISIBLE).split()).strip()


def load_summaries(paths: list[Path]) -> list[dict]:
    """
    يقبل ما يخرج فعلًا من المنصة بأشكاله: ملخّصًا واحدًا، أو مغلّفًا في
    {"data": …} كما ترده الـAPI، أو مصفوفة دفعات، أو ملفًا لكل دفعة.
    """
    out: list[dict] = []

    def take(obj) -> None:
        if isinstance(obj, list):
            for o in obj:
                take(o)
            return
        if not isinstance(obj, dict):
            raise SystemExit("شكل ردّ غير مفهوم — المتوقع كائن أو مصفوفة كائنات")
        if "data" in obj and isinstance(obj["data"], (dict, list)):
            take(obj["data"])
            return
        if "rows" not in obj:
            raise SystemExit("الردّ بلا مفتاح rows — تأكد أنك حفظت جسم الاستجابة كاملًا")
        out.append(obj)

    for p in paths:
        take(json.loads(read_text(p)))
    return out


def summarize_report(path: Path | None, label: str) -> list[str]:
    """يلخّص تقرير توحيد (هواتف/أسماء) إلى أسطر «الافتراضات المطبقة»."""
    if not path or not path.exists():
        return []
    text = read_text(path)
    rows = list(csv.DictReader(text.splitlines(True)))
    counts: dict[str, int] = {}
    for r in rows:
        key = f"{r.get('field', '?')} / {r.get('status', '?')}"
        counts[key] = counts.get(key, 0) + 1
    if not counts:
        return []
    lines = [f"**{label}** (`{path.name}`) — {len(rows)} تغييرًا أو ملاحظة:"]
    lines += [f"  - {k}: {v}" for k, v in sorted(counts.items(), key=lambda kv: -kv[1])]
    return lines


def main() -> int:
    ap = argparse.ArgumentParser(description="المطابقة النهائية وتقرير الترحيل")
    ap.add_argument("--source", required=True, type=Path, action="append",
                    help="ملف مصدر في 01-source (يتكرر لملفات متعددة)")
    ap.add_argument("--import-file", required=True, type=Path, help="ملف الاستيراد في 03-output")
    ap.add_argument("--rejected", type=Path, action="append", default=[],
                    help="ملف مرفوضات (يتكرر)")
    ap.add_argument("--response", type=Path, action="append", default=[],
                    help="جسم استجابة الاستيراد JSON (يتكرر). بدونه: الطَور الأول فقط")
    ap.add_argument("--legacy-id-column", default=None,
                    help="اسم عمود كود الطالب القديم في ملف الاستيراد")
    ap.add_argument("--contacts-report", type=Path, default=None)
    ap.add_argument("--names-report", type=Path, default=None)
    ap.add_argument("--out-dir", type=Path, default=Path("04-reports"))
    ap.add_argument("--sample", type=int, default=10, help="حجم عيّنة التحقق اليدوي")
    ap.add_argument("--seed", type=int, default=0,
                    help="بذرة العيّنة — ثابتة عمدًا ليعيد أي شخص العيّنة نفسها")
    ap.add_argument("--client", default="", help="اسم العميل، للتقرير")
    args = ap.parse_args()

    problems: list[str] = []
    notes: list[str] = []

    src_rows = 0
    src_blank = 0
    per_source: list[tuple[str, int]] = []
    for p in args.source:
        _, body, _ = read_records(p)
        blank = sum(1 for r in body if is_blank(r))
        per_source.append((p.name, len(body) - blank))
        src_rows += len(body) - blank
        src_blank += blank

    imp_header, imp_body, _ = read_records(args.import_file)
    imp_blank = sum(1 for r in imp_body if is_blank(r))
    imp_records = [r for r in imp_body if not is_blank(r)]
    imp_rows = len(imp_records)
    line_of = {i + 2: r for i, r in enumerate(imp_records)}
    if imp_blank:
        notes.append(
            f"ملف الاستيراد به {imp_blank} صفًا فارغًا في وسطه؛ الواجهة تحذفها قبل "
            "الترقيم، فأرقام الأسطر في الردّ تسبق الأسطر الفعلية في الملف. "
            "الربط هنا يعيد بناء رؤية الواجهة، لا رؤية المحرِّر النصي."
        )

    cols = map_columns(imp_header)
    if "name" not in cols:
        raise SystemExit("ملف الاستيراد بلا عمود اسم معروف — المستورد سيرفضه كله.")
    name_idx = cols["name"]
    phone_idx = cols.get("phone")

    legacy_idx = None
    if args.legacy_id_column:
        want = canon_header(args.legacy_id_column)
        for i, h in enumerate(imp_header):
            if canon_header(h) == want:
                legacy_idx = i
                break
        if legacy_idx is None:
            problems.append(
                f"عمود الكود القديم «{args.legacy_id_column}» غير موجود في ملف "
                "الاستيراد — جدول الربط سيخرج بلا الكود القديم، وهو نصف قيمته."
            )

    rejected_total = 0
    reject_reasons: dict[str, int] = {}
    for p in args.rejected:
        if not p.exists():
            problems.append(f"ملف المرفوضات {p} غير موجود")
            continue
        _, body, _ = read_records(p)
        rows = [r for r in body if not is_blank(r)]
        rejected_total += len(rows)
        hdr, _, _ = read_records(p)
        rcols = {canon_header(h): i for i, h in enumerate(hdr)}
        ridx = rcols.get("reason", rcols.get("سبب", rcols.get("السبب")))
        if ridx is not None:
            for r in rows:
                if ridx < len(r):
                    reason = r[ridx].strip() or "(بلا سبب مذكور)"
                    reject_reasons[reason] = reject_reasons.get(reason, 0) + 1

    balance_1_ok = (src_rows == imp_rows + rejected_total)
    if not balance_1_ok:
        diff = src_rows - (imp_rows + rejected_total)
        problems.append(
            f"ميزان ما قبل الاستيراد مختل بمقدار {diff:+d} صفًا: "
            f"المصدر {src_rows} ≠ الاستيراد {imp_rows} + المرفوض {rejected_total}. "
            "صف اختفى بلا سبب مسجَّل، أو ازدوج."
        )

    summaries = load_summaries(args.response) if args.response else []
    crosswalk: list[dict[str, str]] = []
    totals = {"total": 0, "created": 0, "reused": 0, "duplicatesInFile": 0, "failed": 0}
    seen_lines: dict[int, int] = {}
    code_lines: dict[str, list[int]] = {}
    row_failures: list[dict[str, str]] = []

    for n, s in enumerate(summaries, start=1):
        if s.get("dryRun"):
            problems.append(f"الدفعة {n} ردُّ تجربة (dryRun) — لا تُطابَق بها بيانات مكتوبة.")
        rows = s.get("rows", [])
        counted = (int(s.get("created", 0)) + int(s.get("reused", 0))
                   + int(s.get("duplicatesInFile", 0)) + int(s.get("failed", 0)))
        if counted != int(s.get("total", 0)):
            problems.append(
                f"الدفعة {n}: الملخّص لا يوازن — "
                f"{counted} ≠ total {s.get('total')}"
            )
        if len(rows) != int(s.get("total", 0)):
            problems.append(
                f"الدفعة {n}: عدد صفوف الردّ {len(rows)} ≠ total {s.get('total')}"
            )
        for k in totals:
            totals[k] += int(s.get(k, 0))

        for r in rows:
            line = int(r.get("line", 0))
            status = str(r.get("status", ""))
            seen_lines[line] = seen_lines.get(line, 0) + 1
            src_row = line_of.get(line)
            file_name = src_row[name_idx] if src_row and name_idx < len(src_row) else ""

            if src_row is None:
                problems.append(f"السطر {line} في الردّ لا يقابل أي صف في ملف الاستيراد")
            elif norm_name(str(r.get("name", ""))) != norm_name(file_name):
                problems.append(
                    f"السطر {line}: الاسم في الردّ «{r.get('name')}» ≠ الاسم في الملف "
                    f"«{file_name}» — الربط منزلق، وجدول الربط سيكون خاطئًا."
                )

            code = str(r.get("studentCode") or "")
            if status in RESOLVED and not code:
                problems.append(f"السطر {line}: الحالة {status} بلا كود طالب")
            if code:
                code_lines.setdefault(code, []).append(line)

            if status not in RESOLVED:
                row_failures.append({
                    "line": str(line),
                    "name": str(r.get("name", "")),
                    "status": status,
                    "detail": str(r.get("errorCode") or r.get("error")
                                  or (f"يكرر السطر {r.get('duplicateOfLine')}"
                                      if r.get("duplicateOfLine") else "")),
                })

            crosswalk.append({
                "legacy_id": (src_row[legacy_idx]
                              if src_row and legacy_idx is not None and legacy_idx < len(src_row)
                              else ""),
                "student_code": code,
                "student_id": str(r.get("studentId") or ""),
                "name": file_name or str(r.get("name", "")),
                "phone": (src_row[phone_idx]
                          if src_row and phone_idx is not None and phone_idx < len(src_row)
                          else ""),
                "line": str(line),
                "status": status,
                "matched_on": str(r.get("matchedOn") or ""),
            })

    if summaries:
        if totals["total"] != imp_rows:
            problems.append(
                f"مجموع الدفعات {totals['total']} ≠ صفوف ملف الاستيراد {imp_rows} — "
                "دفعة لم تُرسل، أو حُفظ ردُّها مرتين."
            )
        dupes = [l for l, c in seen_lines.items() if c > 1]
        if dupes:
            problems.append(f"أسطر ورد عنها أكثر من ردّ (ازدواج): {sorted(dupes)[:20]}")
        missing = [l for l in line_of if l not in seen_lines]
        if missing:
            problems.append(
                f"{len(missing)} سطرًا في ملف الاستيراد بلا ردّ إطلاقًا "
                f"(أوّلها: {sorted(missing)[:20]}) — هذه هي حالة «الصف الضائع» بعينها."
            )

    merged = {c: ls for c, ls in code_lines.items() if len(ls) > 1}
    distinct_codes = len(code_lines)

    out = args.out_dir
    if crosswalk:
        dump_dicts(out / "crosswalk.csv",
                   ["legacy_id", "student_code", "student_id", "name", "phone",
                    "line", "status", "matched_on"],
                   crosswalk)
    if row_failures:
        dump_dicts(out / "import-row-failures.csv",
                   ["line", "name", "status", "detail"], row_failures)

    sample: list[dict[str, str]] = []
    pool = [c for c in crosswalk if c["status"] in RESOLVED and c["student_code"]]
    if pool:
        rng = random.Random(args.seed)
        sample = rng.sample(pool, min(args.sample, len(pool)))
        dump_dicts(out / "verification-sample.csv",
                   ["student_code", "name", "phone", "legacy_id", "line", "status"],
                   [{k: s[k] for k in ("student_code", "name", "phone", "legacy_id",
                                       "line", "status")} for s in sample])

    L: list[str] = []
    L.append(f"# تقرير ترحيل — {args.client or args.source[0].parent.parent.name}")
    L.append("")
    L.append(f"التاريخ: {date.today().isoformat()}  ")
    if len(per_source) == 1:
        L.append(f"المصدر: `{args.source[0]}`  ")
    else:
        L.append(f"المصادر ({len(per_source)}):  ")
        L += [f"  - `{n}` — {c} صفًا  " for n, c in per_source]
    L.append(f"ملف الاستيراد: `{args.import_file}`")
    L.append("")
    L.append("## 1) الميزان")
    L.append("")
    L.append("| البند | العدد |")
    L.append("|---|---|")
    L.append(f"| صفوف المصادر (غير الفارغة) | {src_rows} |")
    L.append(f"| صفوف فارغة في المصدر (متخطاة) | {src_blank} |")
    L.append(f"| صفوف ملف الاستيراد | {imp_rows} |")
    L.append(f"| مرفوضة قبل الاستيراد | {rejected_total} |")
    L.append("")
    L.append(f"`{src_rows} = {imp_rows} + {rejected_total}` → "
             + ("✅ متزن" if balance_1_ok else "❌ **مختل**"))
    L.append("")

    if summaries:
        L.append("## 2) نتيجة الاستيراد")
        L.append("")
        L.append("| الحالة | العدد |")
        L.append("|---|---|")
        L.append(f"| أُنشئ (طالب جديد) | {totals['created']} |")
        L.append(f"| أُعيد استخدامه (كان موجودًا) | {totals['reused']} |")
        L.append(f"| مكرر داخل الملف | {totals['duplicatesInFile']} |")
        L.append(f"| فشل | {totals['failed']} |")
        L.append(f"| **المجموع** | **{totals['total']}** |")
        L.append("")
        ok2 = (totals["created"] + totals["reused"] + totals["duplicatesInFile"]
               + totals["failed"] == totals["total"] == imp_rows)
        L.append(f"`{totals['created']} + {totals['reused']} + "
                 f"{totals['duplicatesInFile']} + {totals['failed']} = "
                 f"{totals['total']}` ومقابلها {imp_rows} صفًا في الملف → "
                 + ("✅ متزن" if ok2 else "❌ **مختل**"))
        L.append("")
        L.append(f"أكواد طلاب مميّزة في المنصة: **{distinct_codes}**")
        if merged:
            L.append("")
            L.append(f"⚠️ **{len(merged)} طالبًا استقبل أكثر من صف** — إعادة استخدام "
                     "مشروعة (نفس الهاتف أو الرقم القومي)، وهي تفسّر لماذا سيكون عدد "
                     "الطلاب في المنصة أقل من عدد صفوف كشف العميل. أبلغ العميل بها "
                     "صراحةً بدل أن يكتشفها بنفسه:")
            L.append("")
            L.append("| كود الطالب | الأسطر |")
            L.append("|---|---|")
            for c, ls in list(merged.items())[:30]:
                L.append(f"| {c} | {' ، '.join(str(x) for x in ls)} |")
        L.append("")

    L.append("## 3) المرفوض وما يلزم من العميل")
    L.append("")
    if reject_reasons:
        L.append("| السبب | العدد |")
        L.append("|---|---|")
        for r, c in sorted(reject_reasons.items(), key=lambda kv: -kv[1]):
            L.append(f"| {r} | {c} |")
    elif rejected_total:
        L.append(f"{rejected_total} صفًا مرفوضًا (بلا عمود `reason` في ملف المرفوضات).")
    else:
        L.append("لا مرفوضات.")
    if row_failures:
        L.append("")
        L.append(f"وأثناء الاستيراد فشل/تكرر **{len(row_failures)}** صفًا — "
                 "التفصيل في `import-row-failures.csv`.")
    L.append("")

    L.append("## 4) الافتراضات المطبقة أثناء التنظيف")
    L.append("")
    assumed = (summarize_report(args.contacts_report, "توحيد الهواتف والرقم القومي")
               + summarize_report(args.names_report, "توحيد الأسماء"))
    L += assumed or ["لم تُمرَّر تقارير التوحيد؛ مرّرها بـ`--contacts-report` و"
                     "`--names-report` ليُذكر هنا ما غُيّر بالضبط."]
    L.append("")
    L.append("ولم يُخترع أي حقل: كل خانة تعذّر توحيدها تُركت فارغة أو كما هي، ومذكورة "
             "في تقارير التوحيد.")
    L.append("")

    L.append("## 5) ما لم يُنقل عمدًا")
    L.append("")
    L.append("- **المدفوعات والاشتراكات والأرصدة**: دفتر الأستاذ append-only، "
             "والرصيد لا يُنشأ إلا من حركة حقيقية. تاريخ العميل المالي يبقى عنده.")
    L.append("- **الحضور التاريخي**: لا مسار استيراد له، والحضور يشغّل محرك التسوية "
             "المالية — أي حضور مُستورد يوزّع أموالًا لم تُحصَّل.")
    L.append("- **الدرجات السابقة**، و**المجموعات والمعلمون** (تُنشأ يدويًا).")
    L.append("")

    L.append("## 6) التحقق بعد الاستيراد")
    L.append("")
    if sample:
        L.append(f"افتح المنصة وابحث عن كل كود من العيّنة التالية ({len(sample)} طلاب، "
                 f"بذرة {args.seed} فيعيدها أي شخص كما هي) وقارن الاسم والهاتف "
                 "بالمصدر:")
        L.append("")
        L.append("| كود Edura | الاسم | الهاتف | الكود القديم | سطر ملف الاستيراد |")
        L.append("|---|---|---|---|---|")
        for s in sample:
            L.append(f"| {s['student_code']} | {s['name']} | {s['phone']} | "
                     f"{s['legacy_id'] or '—'} | {s['line']} |")
        L.append("")
        L.append(f"وهذا الترحيل أضاف **{distinct_codes}** طالبًا مميّزًا إلى كشف "
                 f"السنتر، لا {imp_rows} — الفرق هو إعادة الاستخدام والتكرار داخل "
                 "الملف. (إن كان للسنتر طلاب قبل الترحيل فكشفه أكبر من هذا الرقم.)")
    else:
        L.append("لا عيّنة: لم يُمرَّر ردّ استيراد بعد. شغّل السكربت ثانيةً بـ"
                 "`--response` بعد الاستيراد الفعلي.")
    L.append("")

    L.append("## 7) الحكم")
    L.append("")
    if problems:
        L.append(f"❌ **{len(problems)} مشكلة تمنع التسليم:**")
        L.append("")
        L += [f"{i}. {p}" for i, p in enumerate(problems, 1)]
    else:
        L.append("✅ كل الموازين متزنة، وكل سطر مُبلَّغ عنه مرة واحدة، والاسم في كل "
                 "ردّ يطابق الاسم في صفه.")
    if notes:
        L.append("")
        L.append("ملاحظات:")
        L += [f"- {n}" for n in notes]
    L.append("")

    out.mkdir(parents=True, exist_ok=True)
    report_path = out / "migration-report.md"
    report_path.write_text("\n".join(L), encoding="utf-8")

    if len(per_source) > 1:
        print("\nالمصادر: " + "، ".join(f"{n} ({c})" for n, c in per_source))
    print(f"\nالمصدر {src_rows} صفًا  |  الاستيراد {imp_rows}  |  المرفوض {rejected_total}")
    print("ميزان ما قبل الاستيراد: " + ("✅ متزن" if balance_1_ok else "❌ مختل"))
    if summaries:
        print(f"بعد الاستيراد: أُنشئ {totals['created']} | أُعيد استخدامه "
              f"{totals['reused']} | مكرر {totals['duplicatesInFile']} | فشل "
              f"{totals['failed']} | المجموع {totals['total']}")
        print(f"أكواد مميّزة: {distinct_codes}"
              + (f"  (‏{len(merged)} طالبًا استقبل أكثر من صف)" if merged else ""))
    print(f"\nالتقرير: {report_path}")
    if crosswalk:
        print(f"جدول الربط: {out / 'crosswalk.csv'}  ({len(crosswalk)} صفًا)")
    if sample:
        print(f"عيّنة التحقق: {out / 'verification-sample.csv'}")

    if problems:
        print(f"\n❌ {len(problems)} مشكلة تمنع التسليم:", file=sys.stderr)
        for p in problems:
            print("   - " + p, file=sys.stderr)
        return 1
    print("\n✅ متزن — لا صف ضائع.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
