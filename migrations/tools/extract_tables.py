#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_tables.py — استخراج الجداول من ملفات Excel ومن الصور/PDF الممسوحة.

مدخلان مختلفان اختلافًا جذريًا، ويعاملان بحسب ذلك:

  ┌─ .xlsx ─ استخراج **حتمي**. قراءة مباشرة من داخل الملف، فما يخرج هو ما كُتب.
  └─ صورة/PDF ─ **تخمين آلي**. كل خانة تخرج موسومة `source=scan` ومعها درجة ثقة،
                ولا شيء منها يدخل استيرادًا قبل أن تراه عين بشر.

═══════════════════════════════════════════════════════════════════════════
لماذا تقرأ .xlsx مباشرةً بدل «Save As CSV»
═══════════════════════════════════════════════════════════════════════════
لأن التصدير إلى CSV **يفقد خانات فعلًا**. الرقم 01012345678 المخزَّن في الخلية
كعدد يُصدَّر أحيانًا كـ `1.01234568E+10` — تسع خانات معنوية لرقم من إحدى عشرة،
والخانتان الأخيرتان ضاعتا قبل أن يبدأ الترحيل (وهي الحالة التي يرفض
`normalize_contacts.py` توسيعها لأن توسيعها اختراع رقم).

داخل ملف .xlsx القيمة مخزَّنة كاملة (`<v>10123456789</v>`) والترميز العلمي مجرد
**تنسيق عرض**. فالقراءة المباشرة تسترجع الرقم الذي فُقد في التصدير. هذا وحده
سبب كافٍ لاستخدام هذا السكربت بدل فتح الملف وحفظه CSV.

يعتمد على المكتبة القياسية وحدها لمسار Excel: ‏.xlsx ملفُّ ZIP فيه XML، و
`zipfile` + `ElementTree` يكفيان. **بلا pandas وبلا openpyxl** — لا تبعية،
ولا تحويل صامت لعمود الهاتف إلى عدد عشري.

═══════════════════════════════════════════════════════════════════════════
وماذا عن الصور — قُل الحقيقة قبل أن تُشغّلها
═══════════════════════════════════════════════════════════════════════════
1. **الخط اليدوي لا يُقرأ.** Tesseract مدرَّب على الطباعة؛ ودفاتر السناتر مكتوبة
   بخط اليد. ما يخرج من دفتر مصوَّر ليس نصًا ناقصًا بل نصٌّ **مختلَق**. هذا
   السكربت نافع لجدول **مطبوع** مصوَّر أو ممسوح (كشف من المنصة السابقة مثلًا)،
   ولا شيء فيه يجعل الخط اليدوي مقروءًا.
2. **الأرقام هي الأخطر.** خانة مقروءة خطأً في الهاتف أو الرقم القومي لا تُخزَّن
   خطأً فحسب — بل تحجز مفتاحًا فريدًا باسم إنسان آخر حجزًا دائمًا. لذلك **كل**
   خانة فيها أرقام تذهب إلى ملف المراجعة مهما بلغت ثقتها.
3. **لا خدمة سحابية.** هذه صور لكشوف أطفال؛ إرسالها إلى OCR على الإنترنت يخالف
   قاعدة الخصوصية في القسم (5) من CLAUDE.md. المحرّك محلي، والسكربت لا يفتح
   اتصالًا بأي شبكة.

الاستخدام:

    python3 extract_tables.py --in 01-source/roster.xlsx --out-dir 02-work
    python3 extract_tables.py --in 01-source/roster.xlsx --sheet "الصف الثالث"
    python3 extract_tables.py --in 01-source/page-01.jpg --out-dir 02-work --lang ara

    # سرد أوراق ملف Excel دون استخراج
    python3 extract_tables.py --in 01-source/roster.xlsx --list-sheets
"""

from __future__ import annotations

import argparse
import csv
import re
import shutil
import subprocess
import sys
import zipfile
from datetime import date, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET

from _common import HEADER_ALIASES, canon_header, dump_dicts, write_csv

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp"}


# ===========================================================================
# مسار Excel
# ===========================================================================
def col_index(ref: str) -> int:
    """A1 → 0، AB7 → 27. موضع الخلية معلومة: بدونه تنزلق الأعمدة عند خانة فارغة."""
    n = 0
    for ch in ref:
        if not ch.isalpha():
            break
        n = n * 26 + (ord(ch.upper()) - 64)
    return n - 1


# أرقام التنسيقات المدمجة التي تعني تاريخًا/وقتًا في معيار OOXML.
BUILTIN_DATE_FMTS = {14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47}
DATE_CHARS_RE = re.compile(r"[ymdhs]", re.I)


def is_date_format(code: str) -> bool:
    """صيغة مخصّصة تُعدّ تاريخًا إن حملت رموز تاريخ خارج النصوص المقتبسة."""
    stripped = re.sub(r"\[[^\]]*\]|\"[^\"]*\"", "", code)
    return bool(DATE_CHARS_RE.search(stripped))


def serial_to_iso(n: float, date1904: bool) -> str:
    if date1904:
        base, days = date(1904, 1, 1), n
    else:
        # علة 1900 الكبيسة في Excel: التسلسل 60 يوم غير موجود أصلًا.
        base, days = date(1899, 12, 31), (n - 1 if n >= 61 else n)
    whole = int(days)
    frac = days - whole
    d = base + timedelta(days=whole)
    if frac > 1e-9:
        secs = round(frac * 86400)
        return f"{d.isoformat()} {secs // 3600:02d}:{(secs % 3600) // 60:02d}"
    return d.isoformat()


def num_to_text(v: str) -> str:
    """
    عدد إلى نص **بلا ترميز علمي وبلا صفر عشري زائد** — وهذا هو بيت القصيد:
    10123456789 تخرج كما هي، لا 1.0123456789e+10 ولا 10123456789.0.
    """
    try:
        f = float(v)
    except ValueError:
        return v
    if f == int(f) and abs(f) < 1e15:
        return str(int(f))
    return repr(f)


def load_xlsx(path: Path) -> tuple[list[tuple[str, list[list[str]]]], list[str]]:
    """يعيد ([(اسم الورقة, الصفوف)], تحذيرات)."""
    warns: list[str] = []
    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())

        # النصوص المشتركة
        shared: list[str] = []
        if "xl/sharedStrings.xml" in names:
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", NS):
                shared.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))

        # التنسيقات، لمعرفة أي خلية تاريخ
        date_style: set[int] = set()
        if "xl/styles.xml" in names:
            sroot = ET.fromstring(z.read("xl/styles.xml"))
            custom = {}
            for nf in sroot.iter(f"{{{NS['m']}}}numFmt"):
                custom[int(nf.get("numFmtId", "0"))] = nf.get("formatCode", "")
            xfs = sroot.find("m:cellXfs", NS)
            if xfs is not None:
                for i, xf in enumerate(xfs.findall("m:xf", NS)):
                    fid = int(xf.get("numFmtId", "0"))
                    if fid in BUILTIN_DATE_FMTS or (fid in custom and is_date_format(custom[fid])):
                        date_style.add(i)

        wb = ET.fromstring(z.read("xl/workbook.xml"))
        pr = wb.find("m:workbookPr", NS)
        date1904 = bool(pr is not None and pr.get("date1904") in ("1", "true"))

        rels = {}
        if "xl/_rels/workbook.xml.rels" in names:
            rroot = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
            for rel in rroot.findall("pr:Relationship", NS):
                rels[rel.get("Id")] = rel.get("Target")

        sheets: list[tuple[str, str]] = []
        for sh in wb.iter(f"{{{NS['m']}}}sheet"):
            rid = sh.get(f"{{{NS['r']}}}id")
            target = rels.get(rid, "")
            if target.startswith("/"):
                target = target[1:]
            elif not target.startswith("xl/"):
                target = "xl/" + target
            if target in names:
                sheets.append((sh.get("name", "Sheet"), target))

        out: list[tuple[str, list[list[str]]]] = []
        for sheet_name, target in sheets:
            root = ET.fromstring(z.read(target))

            # الخلايا المدمَجة: القيمة مخزَّنة في الخلية العليا اليمنى فقط،
            # وبقية النطاق فارغة في الملف — فتخرج فارغةً هنا. لا نملؤها
            # تلقائيًا (نسخ عنوان مدمَج إلى ثلاثة أعمدة يُفسد مطابقة العناوين)،
            # لكن السكوت عنها يجعل فراغًا مقصودًا يبدو كفراغ في البيانات.
            merges = [mc.get("ref", "") for mc in root.iter(f"{{{NS['m']}}}mergeCell")]
            if merges:
                warns.append(
                    f"«{sheet_name}»: {len(merges)} نطاقًا مدمَجًا "
                    f"({'، '.join(merges[:5])}{'…' if len(merges) > 5 else ''}) — "
                    "قيمة كل نطاق في خليته الأولى وحدها، وبقيته يخرج فارغًا. "
                    "راجع هذه المواضع قبل الاعتماد على الأعمدة."
                )

            rows: list[list[str]] = []
            for row in root.iter(f"{{{NS['m']}}}row"):
                cells: dict[int, str] = {}
                for c in row.findall("m:c", NS):
                    ref = c.get("r") or ""
                    idx = col_index(ref) if ref else len(cells)
                    t = c.get("t")
                    if t == "inlineStr":
                        is_el = c.find("m:is", NS)
                        val = "".join(x.text or "" for x in is_el.iter(f"{{{NS['m']}}}t")) \
                            if is_el is not None else ""
                    else:
                        v = c.find("m:v", NS)
                        raw = v.text if v is not None and v.text is not None else ""
                        if t == "s":
                            val = shared[int(raw)] if raw.isdigit() and int(raw) < len(shared) else ""
                        elif t == "b":
                            val = "TRUE" if raw == "1" else "FALSE"
                        elif t in ("str", "e"):
                            val = raw
                        else:
                            style = int(c.get("s") or -1)
                            if raw and style in date_style:
                                try:
                                    val = serial_to_iso(float(raw), date1904)
                                except ValueError:
                                    val = raw
                            else:
                                val = num_to_text(raw) if raw else ""
                    if val != "":
                        cells[idx] = val
                width = max(cells) + 1 if cells else 0
                rows.append([cells.get(i, "") for i in range(width)])
            # توحيد عرض الصفوف حتى لا تنزلق الأعمدة في الـCSV
            w = max((len(r) for r in rows), default=0)
            rows = [r + [""] * (w - len(r)) for r in rows]
            out.append((sheet_name, rows))

        if any(n.startswith("xl/media/") for n in names):
            warns.append("الملف يحوي صورًا مدمجة — إن كانت الأرقام في صورة لا في "
                         "خلايا فلن يستخرجها هذا المسار.")
    return out, warns


# ===========================================================================
# مسار الصور / PDF
# ===========================================================================
def preflight_ocr(lang: str) -> list[str]:
    """يعيد قائمة أسباب المنع، كلٌّ ومعه أمرُ إصلاحه. فارغة = جاهز."""
    problems: list[str] = []
    if not shutil.which("tesseract"):
        problems.append("محرّك OCR غير مثبت.  الإصلاح:  brew install tesseract")
        return problems
    try:
        # السطر الأول من المخرَج عنوان («List of available languages…») لا لغة —
        # وإدراجه يجعل رسالة الخطأ نفسها كاذبة.
        out = subprocess.run(["tesseract", "--list-langs"], capture_output=True,
                             text=True, timeout=30).stdout.splitlines()
        langs = [l.strip() for l in out[1:] if l.strip()]
    except Exception:
        langs = []
    for want in lang.split("+"):
        if want not in langs:
            problems.append(
                f"بيانات اللغة «{want}» غير مثبتة (المتاح: {'، '.join(langs) or 'لا شيء'}). "
                "الإصلاح:  brew install tesseract-lang"
            )
    return problems


def preflight_pdf() -> list[str]:
    if not shutil.which("pdftoppm"):
        return ["أدوات PDF غير مثبتة.  الإصلاح:  brew install poppler"]
    return []


# خطوط الجدول نفسها يقرؤها المحرّك كحروف («|» غالبًا)، وهي تقع **في الفجوات
# بين الأعمدة بالضبط** — فتملؤها وتُخفيها، وينهار كشف الأعمدة إلى عمود واحد.
# هذا ما كان يحدث فعلًا قبل هذا الترشيح، لا احتمالًا نظريًا.
BORDER_RE = re.compile(r"^[|¦‖_—–\-=~/\\]{1,3}$")


def ocr_words(image: Path, lang: str, psm: str) -> list[dict]:
    """كلمات مع مواضعها ودرجات ثقتها، من مخرج tesseract بصيغة TSV."""
    res = subprocess.run(
        ["tesseract", str(image), "stdout", "-l", lang, "--psm", psm, "tsv"],
        capture_output=True, text=True,
    )
    if res.returncode != 0:
        raise SystemExit(f"فشل tesseract على {image.name}:\n{res.stderr.strip()}")
    words: list[dict] = []
    borders = [0]
    for row in csv.DictReader(res.stdout.splitlines(), delimiter="\t",
                              quoting=csv.QUOTE_NONE):
        text = (row.get("text") or "").strip()
        if not text:
            continue
        try:
            conf = float(row.get("conf") or -1)
        except ValueError:
            conf = -1
        if conf < 0:
            continue
        if BORDER_RE.match(text):
            borders[0] += 1
            continue
        words.append({
            "text": text, "conf": conf,
            "left": int(row["left"]), "top": int(row["top"]),
            "width": int(row["width"]), "height": int(row["height"]),
            "line": (row["block_num"], row["par_num"], row["line_num"]),
        })
    return words, borders[0]


def find_column_bounds(words: list[dict], min_gap_ratio: float = 0.012) -> list[int]:
    """
    حدود الأعمدة من **الفجوات الرأسية** التي لا تعبرها أي كلمة.

    هذا هو الجزء الذي ينجح مع جدول مطبوع منتظم ويفشل مع صفحة مائلة أو مكتوبة
    بخط اليد — والفشل يظهر كأعمدة مندمجة، فلا يمر صامتًا.
    """
    if not words:
        return []
    left_edge = min(w["left"] for w in words)
    right = max(w["left"] + w["width"] for w in words)
    occupied = bytearray(right + 2)
    for w in words:
        for x in range(w["left"], min(w["left"] + w["width"], right) + 1):
            occupied[x] = 1
    min_gap = max(6, int((right - left_edge) * min_gap_ratio))
    bounds, run_start = [], None
    # المسح يبدأ من أول كلمة لا من حافة الصورة: هامش الصفحة فراغ لا فاصل بين
    # عمودين، وحسبانه فاصلًا يولّد عمودًا وهميًا فارغًا في أول كل جدول.
    for x in range(left_edge, right + 1):
        if not occupied[x]:
            if run_start is None:
                run_start = x
        else:
            if run_start is not None and x - run_start >= min_gap:
                bounds.append((run_start + x) // 2)
            run_start = None
    return bounds


def group_rows(words: list[dict]) -> list[list[dict]]:
    """
    تجميع الكلمات في صفوف **هندسيًا**، بمراكزها الرأسية لا بترقيم tesseract
    للأسطر.

    ولماذا لا نثق بترقيمه: هو ناتج تحليل تخطيط الصفحة، ويتفكّك حين تتباعد
    الخلايا — فصفحة PDF محوَّلة عند 300dpi جعلت **كل خانة سطرًا مستقلًا**، فخرج
    جدول من أربعة صفوف في ستة عشر صفًا كلٌّ منها خانة واحدة وبقيتها فارغة.
    ارتفاع الحرف معلومة من الصورة نفسها، فلا تتأثر بالدقة ولا بالتباعد.
    """
    if not words:
        return []
    heights = sorted(w["height"] for w in words)
    tol = max(4, int(heights[len(heights) // 2] * 0.6))
    ordered = sorted(words, key=lambda w: w["top"] + w["height"] / 2)

    rows: list[list[dict]] = []
    cur = [ordered[0]]
    center = ordered[0]["top"] + ordered[0]["height"] / 2
    for w in ordered[1:]:
        c = w["top"] + w["height"] / 2
        if abs(c - center) <= tol:
            cur.append(w)
            center = sum(x["top"] + x["height"] / 2 for x in cur) / len(cur)
        else:
            rows.append(cur)
            cur, center = [w], c
    rows.append(cur)
    return rows


def build_grid(words: list[dict], rtl: bool) -> tuple[list[list[str]], list[list[float]]]:
    bounds = find_column_bounds(words)

    def col_of(w: dict) -> int:
        center = w["left"] + w["width"] / 2
        return sum(1 for b in bounds if center > b)

    ordered = group_rows(words)

    ncols = len(bounds) + 1
    grid, confs = [], []
    for ws in ordered:
        cells = [[] for _ in range(ncols)]
        for w in sorted(ws, key=lambda x: x["left"], reverse=rtl):
            cells[col_of(w)].append(w)
        grid.append([" ".join(x["text"] for x in c) for c in cells])
        confs.append([min((x["conf"] for x in c), default=0.0) for c in cells])
    if rtl:
        grid = [list(reversed(r)) for r in grid]
        confs = [list(reversed(r)) for r in confs]
    return grid, confs


def header_from(row: list[str]) -> list[str] | None:
    """إن كان الصف الأول عناوين نعرفها، استخدمه — وإلا ولّد col_1…"""
    hits = sum(1 for cell in row
               for aliases in HEADER_ALIASES.values()
               if canon_header(cell) in aliases)
    return row if hits >= 2 else None


# ===========================================================================
def main() -> int:
    ap = argparse.ArgumentParser(
        description="استخراج الجداول من Excel ومن الصور/PDF الممسوحة")
    ap.add_argument("--in", dest="src", required=True, type=Path)
    ap.add_argument("--out-dir", type=Path, default=Path("02-work"))
    ap.add_argument("--sheet", default=None, help="اسم ورقة بعينها (Excel)")
    ap.add_argument("--list-sheets", action="store_true")
    ap.add_argument("--lang", default="ara+eng", help="لغات OCR")
    # PSM 4 («عمود واحد بأحجام خطوط متفاوتة») لا 6 («كتلة موحّدة»): مقيسًا على
    # كشف عربي مطبوع، أعطى 6 قمامةً بثقة 29% بينما قرأ 4 الجدولَ كلَّه وكل رقم
    # فيه. الفرق ليس ضبطًا دقيقًا بل الفرق بين أداة تعمل وأداة لا تعمل.
    ap.add_argument("--psm", default="4", help="نمط تقسيم الصفحة في tesseract "
                    "(4 = عمود بأحجام متفاوتة، الأنسب للجداول)")
    ap.add_argument("--ltr", action="store_true",
                    help="رتّب الأعمدة من اليسار (الافتراضي: من اليمين، لأن الكشف عربي)")
    ap.add_argument("--min-conf", type=float, default=80.0,
                    help="ما دون هذه الثقة يذهب إلى ملف المراجعة")
    ap.add_argument("--columns", default=None,
                    help="أسماء الأعمدة مفصولةً بفواصل، للصفحات التي لا صف عناوين "
                         "فيها — ودفتر مكتوب بخط اليد لا يحمل عناوين عادةً، فيخرج "
                         "col_1… وترفضه الأداة التالية. مثال: "
                         "--columns \"الاسم,رقم الهاتف,الرقم القومي,ولي الأمر\"")
    ap.add_argument("--dpi", type=int, default=300,
                    help="دقة تحويل صفحات PDF الممسوح إلى صور")
    ap.add_argument("--pdf-text-min", type=int, default=40,
                    help="أقل عدد حروف يجعل الـPDF يُعدّ نصيًّا لا ممسوحًا")
    args = ap.parse_args()

    src: Path = args.src
    if not src.exists():
        raise SystemExit(f"الملف غير موجود: {src}")
    ext = src.suffix.lower()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ xls
    if ext == ".xls":
        raise SystemExit(
            "‏.xls (الصيغة الثنائية القديمة) غير مدعومة، ولن تُدعم بمكتبة إضافية "
            "من أجل ملف واحد. افتحه في Excel واحفظه بصيغة .xlsx ثم أعد التشغيل — "
            "والحفظ كـ .xlsx يحتفظ بالأرقام كاملة، بخلاف الحفظ كـ CSV."
        )

    # ----------------------------------------------------------------- xlsx
    if ext == ".xlsx":
        sheets, warns = load_xlsx(src)
        if args.list_sheets:
            print(f"\n{src.name} — {len(sheets)} ورقة:")
            for name, rows in sheets:
                filled = sum(1 for r in rows if any(c.strip() for c in r))
                print(f"  • {name:<30} {filled} صفًا غير فارغ، "
                      f"{max((len(r) for r in rows), default=0)} عمودًا")
            return 0

        chosen = [s for s in sheets if args.sheet is None or s[0] == args.sheet]
        if args.sheet and not chosen:
            raise SystemExit(f"لا توجد ورقة باسم «{args.sheet}». المتاح: "
                             + "، ".join(n for n, _ in sheets))

        print(f"\n{src.name}")
        for name, rows in chosen:
            data = [r for r in rows if any(c.strip() for c in r)]
            if not data:
                print(f"  • {name}: فارغة — تُخطّى")
                continue
            safe = re.sub(r"[^\w؀-ۿ-]+", "_", name).strip("_") or "sheet"
            out = args.out_dir / f"{src.stem}.{safe}.csv"
            write_csv(out, data[0], data[1:])
            print(f"  • {name}: {len(data) - 1} صفًا + رأس → {out}")
        for w in warns:
            print(f"  ⚠️  {w}")
        print("\nالأرقام خرجت كما هي مخزَّنة داخل الملف — لا ترميز علمي ولا خانات "
              "مفقودة. مرّرها الآن على normalize_contacts.py.")
        return 0

    # ------------------------------------------------------------ صورة/PDF
    if ext == ".pdf":
        problems = preflight_pdf()
        if problems:
            print("\n❌ لا يمكن المتابعة:", file=sys.stderr)
            for p in problems:
                print("   - " + p, file=sys.stderr)
            return 2

        # ── الفرق الذي يخلط بين الناس: PDF **نصّي** ≠ PDF **ممسوح**.
        # الأول يحمل النص داخله فيُستخرج حرفًا بحرف بلا تخمين ولا درجة ثقة؛
        # والثاني صورةٌ لا غير. تشغيل OCR على نصّي إتلافٌ لبيانات سليمة، لذا
        # نسأل الملف أولًا بدل أن نفترض.
        txt = subprocess.run(["pdftotext", "-layout", "-q", str(src), "-"],
                             capture_output=True, text=True).stdout
        dense = len("".join(txt.split()))
        if dense >= args.pdf_text_min:
            rows = [re.split(r"\s{2,}", ln.strip())
                    for ln in txt.splitlines() if ln.strip()]
            width = max((len(r) for r in rows), default=0)
            rows = [r + [""] * (width - len(r)) for r in rows]
            head = header_from(rows[0]) if rows else None
            body = rows[1:] if head else rows
            if head is None:
                head = [f"col_{i + 1}" for i in range(width)]
            out = args.out_dir / f"{src.stem}.csv"
            # `pdf_text` لا `scan`: هذه قيم منقولة لا مُخمَّنة، ولا يجوز أن
            # تحمل الوسم الذي يعني «راجعني قبل أن تثق بي».
            write_csv(out, head + ["source"], [r + ["pdf_text"] for r in body])
            print(f"\n{src.name}: ملف PDF **نصّي** ({dense} حرفًا) — استُخرج النص "
                  f"مباشرةً بلا OCR وبلا تخمين.\n  {len(body)} صفًا × {width} "
                  f"عمودًا → {out}")
            print("  الأعمدة قُسّمت على المسافات المتتالية؛ راجع الحدود في الملف، "
                  "لكن الحروف نفسها منقولة حرفيًا لا مقروءة آليًا.")
            return 0

        problems = preflight_ocr(args.lang)
        if problems:
            print("\n❌ الملف ممسوح (بلا طبقة نص) ويلزمه OCR:", file=sys.stderr)
            for p in problems:
                print("   - " + p, file=sys.stderr)
            return 2

        pages_dir = args.out_dir / f"{src.stem}.pages"
        pages_dir.mkdir(parents=True, exist_ok=True)
        # 300dpi: ما دون ذلك يفقد tesseract التشكيل العربي، وما فوقه يبطّئ بلا
        # مقابل على مسح ثنائي اللون.
        res = subprocess.run(["pdftoppm", "-r", str(args.dpi), "-png",
                              str(src), str(pages_dir / "page")],
                             capture_output=True, text=True)
        if res.returncode != 0:
            raise SystemExit(f"فشل تحويل الصفحات:\n{res.stderr.strip()}")
        pages = sorted(pages_dir.glob("page*.png"))
        if not pages:
            raise SystemExit("لم تُنتَج أي صفحة من الملف")
        print(f"\n{src.name}: ملف **ممسوح** ({dense} حرفًا من النص فقط) — "
              f"{len(pages)} صفحة عند {args.dpi}dpi، وكل صفحة تمرّ بنفس فحوص "
              "الصور تمامًا.")
        rc = 0
        for page in pages:
            rc |= process_image(page, args)
        return rc

    if ext not in IMAGE_EXT:
        raise SystemExit(f"امتداد غير مدعوم: {ext}. المدعوم: .xlsx، وصور "
                         + "، ".join(sorted(IMAGE_EXT)))

    problems = preflight_ocr(args.lang)
    if problems:
        print("\n❌ لا يمكن المتابعة:", file=sys.stderr)
        for p in problems:
            print("   - " + p, file=sys.stderr)
        print("\nولا يُلتفّ على ذلك بخدمة OCR سحابية: هذه صور كشوف أطفال، "
              "وإرسالها خارج الجهاز يخالف قاعدة الخصوصية في CLAUDE.md §5.",
              file=sys.stderr)
        return 2

    return process_image(src, args)


def process_image(src: Path, args) -> int:
    """
    صفحة واحدة: OCR ← شبكة ← CSV + ملف مراجعة.

    يستدعيها مسار الصور ومسار PDF على السواء — فصفحةُ PDF ممسوح تمرّ بنفس
    الفحوص ونفس ملف المراجعة بالضبط، ولا يمكن أن يفترق السلوكان.
    """
    words, borders = ocr_words(src, args.lang, args.psm)
    if not words:
        raise SystemExit("لم يُقرأ أي نص. جرّب مسحًا بدقة 300dpi، أو صفحة مستوية "
                         "غير مائلة. وإن كان الكشف بخط اليد فلن ينفع OCR أصلًا.")

    grid, confs = build_grid(words, rtl=not args.ltr)
    if grid and len(grid[0]) < 2:
        # عمود واحد ليس جدولًا. قولها صراحةً: الملف سيُكتب على أي حال، وبلا هذه
        # الجملة يبدو كأنه نجح في استخراج «عمود واحد» لا كأنه أخفق في إيجاد جدول.
        print("\n⚠️  لم يُعثر على أي فاصل بين أعمدة — الناتج عمود واحد، أي أن هذه "
              "ليست جدولًا في نظر الأداة. الأسباب المعتادة: الصفحة مائلة، أو "
              "الفواصل بين الأعمدة أضيق من أن تُرى، أو اللغة المطلوبة ليست لغة "
              "الصفحة (جرّب --lang)، أو الكشف بخط اليد.", file=sys.stderr)
    ncols = max((len(r) for r in grid), default=0)
    if args.columns:
        # عناوين يعطيها المشغّل: كل الصفوف بيانات، فالصفحة لا رأس لها أصلًا.
        header = [c.strip() for c in args.columns.split(",")]
        if len(header) != ncols:
            print(f"\n⚠️  أعطيت {len(header)} عنوانًا والمكتشَف {ncols} عمودًا — "
                  "راجع أيهما الصحيح قبل الاعتماد على الملف.", file=sys.stderr)
            header = (header + [f"col_{i + 1}" for i in range(ncols)])[:ncols]
        body, body_conf = grid, confs
    else:
        header = header_from(grid[0]) if grid else None
        body = grid[1:] if header else grid
        body_conf = confs[1:] if header else confs
        if header is None:
            header = [f"col_{i + 1}" for i in range(ncols)]

    # عمود `source` مطلوب في CLAUDE.md §4/5: كل صف من مسح يُعرَف بأنه كذلك.
    out = args.out_dir / f"{src.stem}.csv"
    write_csv(out, header + ["source"], [r + ["scan"] for r in body])

    review: list[dict[str, str]] = []
    empty_cells = [0]
    for i, (row, crow) in enumerate(zip(body, body_conf)):
        for j, cell in enumerate(row):
            conf = crow[j] if j < len(crow) else 0.0
            if not cell.strip():
                # الخانة الفارغة هي أخطر ما في المسح، ولا تكاد تُرى: المحرّك
                # يُسقط خانات كاملة بلا أثر — لا نص خاطئ ولا ثقة منخفضة، فقط
                # فراغ يبدو كأنه فراغ في الأصل. قِيس هذا على مسح حقيقي: ثلاث
                # خانات مقروءة تمامًا في الصورة المباشرة اختفت من نفس الصفحة
                # بعد مسحها. فلا يمكن لملف المراجعة أن يُبلّغ عمّا لا وجود له،
                # وكل ما يستطيعه — وهو ما يفعله هنا — أن يطلب تأكيد كل فراغ.
                empty_cells[0] += 1
                review.append({
                    "row": str(i + 2),
                    "column": header[j] if j < len(header) else f"col_{j + 1}",
                    "text": "", "confidence": "—",
                    "why": "خانة فارغة — تأكد أنها فارغة في الأصل، فالمسح يُسقط "
                           "خانات كاملة بلا أثر",
                })
                continue
            has_digits = any(ch.isdigit() for ch in cell)
            if has_digits or conf < args.min_conf:
                review.append({
                    "row": str(i + 2), "column": header[j] if j < len(header) else f"col_{j+1}",
                    "text": cell, "confidence": f"{conf:.0f}",
                    "why": "خانة فيها أرقام — تُراجَع دائمًا" if has_digits
                           else f"ثقة أقل من {args.min_conf:.0f}",
                })
    dump_dicts(args.out_dir / f"{src.stem}.review.csv",
               ["row", "column", "text", "confidence", "why"], review)

    avg = sum(w["conf"] for w in words) / len(words)
    print(f"\n{src.name}: {len(body)} صفًا × {ncols} عمودًا → {out}")
    print(f"متوسط الثقة: {avg:.0f}%   |   خانات تحتاج مراجعة: {len(review)}"
          + (f"   (منها {empty_cells[0]} خانة فارغة)" if empty_cells[0] else ""))
    print(f"ملف المراجعة: {args.out_dir / (src.stem + '.review.csv')}")
    print("\n🔴 لا تُمرّر هذا الملف إلى الاستيراد قبل مراجعة كل خانة فيها أرقام "
          "بعينك مقابل الصورة الأصلية: خانة هاتف أو رقم قومي مقروءة خطأً تحجز "
          "مفتاحًا فريدًا باسم إنسان آخر حجزًا دائمًا.")
    if avg < 75:
        print("⚠️  الثقة المتوسطة منخفضة — غالبًا خط يد أو مسح رديء. راجع الصفحة "
              "كلها يدويًا بدل تصحيح خانات متفرقة.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
