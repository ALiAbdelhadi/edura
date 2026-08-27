#!/usr/bin/env python3
"""
اختبارات أدوات الترحيل.

    cd migrations/tools && python3 -m unittest test_tools -v

لماذا تعيش مع الأدوات في نفس المجلد لا في `tests/`: `migrations/.gitignore`
يستبعد كل شيء ثم يستثني `tools/*.py`، فمجلد فرعي يخرج من المستودع بلا أن يلاحظ
أحد — وهو بالضبط ما حدث للأدوات كلها أول مرة.

كل حالة هنا عيبٌ حقيقي وقع أثناء البناء أو قاعدةٌ من كود المنصة، لا حالة
مُتخيَّلة: المسافة العادية التي انزلقت داخل قائمة المحارف غير المرئية فحذفت كل
المسافات من الأسماء؛ ونمط تقسيم الصفحة الذي كان يُخرج قمامة؛ والرقم المختار من
خانة فيها رقمان ثم يُمحى بعد اختياره.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

import _common
import extract_tables as et
import import_students
import normalize_contacts as nc
import normalize_names as nn

HERE = Path(__file__).resolve().parent


def run(script: str, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(HERE / script), *args],
        capture_output=True, text=True, cwd=HERE,
    )


def write(path: Path, rows: list[list[str]]) -> Path:
    import csv
    with path.open("w", encoding="utf-8", newline="") as fh:
        csv.writer(fh).writerows(rows)
    return path


def read(path: Path) -> list[list[str]]:
    import csv
    return list(csv.reader(path.read_text(encoding="utf-8-sig").splitlines()))


class Common(unittest.TestCase):
    def test_space_survives_invisible_stripping(self):
        self.assertNotIn(0x20, _common.INVISIBLE)
        self.assertEqual(_common.INVISIBLE.get(0x00A0), " ", "NBSP فاصل، يُحوَّل لا يُحذف")
        self.assertIsNone(_common.INVISIBLE.get(0x200B), "المسافة صفرية العرض تُحذف")

    def test_header_aliases_match_the_importer(self):
        for want, headers in (
            ("name", ["الاسم", "name", "اسم الطالب"]),
            ("phone", ["رقم الهاتف", "mobile", "الموبايل"]),
            ("nationalId", ["الرقم القومي", "nid"]),
            ("guardianEmail", ["بريد ولي الأمر", "email"]),
        ):
            for h in headers:
                self.assertEqual(_common.map_columns([h]), {want: 0}, h)


class AliasDrift(unittest.TestCase):
    """
    جدول أسماء الأعمدة موجود مرتين: في `student-csv.ts` (وهو ما يُطبِّقه
    المستورد فعلًا) وفي `_common.py` (وهو ما تراه هذه الأدوات). نسختان بلغتين
    لا يمكن دمجهما، فالبديل الوحيد عن الانحراف الصامت هو حارسٌ يقارنهما.

    الانحراف بلا هذا الحارس صامت تمامًا: مرادفٌ يُضاف هناك يجعل عمودًا يقرؤه
    المستورد ولا تراه الأدوات — فتوحّد عمودًا وتتجاهل آخر، ويصل إلى قاعدة
    البيانات ما لم يُنظَّف.
    """

    TS = HERE.parents[1] / "packages/server-core/src/services/center/student-csv.ts"

    def parse_ts(self) -> dict[str, list[str]]:
        src = self.TS.read_text(encoding="utf-8")
        block = re.search(
            r"const HEADER_ALIASES[^=]*=\s*\{(.*?)\n\};", src, re.S)
        self.assertIsNotNone(block, "تعذّر إيجاد HEADER_ALIASES في student-csv.ts")
        out: dict[str, list[str]] = {}
        for field, body in re.findall(r"(\w+)\s*:\s*\[(.*?)\]", block.group(1), re.S):
            out[field] = re.findall(r'"((?:[^"\\]|\\.)*)"', body)
        return out

    def test_the_file_is_where_we_think(self):
        self.assertTrue(self.TS.exists(), f"المستورد ليس في {self.TS}")

    def test_every_field_and_every_alias_matches(self):
        ts = self.parse_ts()
        py = _common.HEADER_ALIASES
        self.assertEqual(sorted(ts), sorted(py), "الحقول اختلفت بين الملفين")
        for field in sorted(ts):
            self.assertEqual(
                sorted(ts[field]), sorted(py[field]),
                f"مرادفات «{field}» انحرفت.\n"
                f"  في student-csv.ts: {sorted(ts[field])}\n"
                f"  في _common.py    : {sorted(py[field])}\n"
                "انسخ الجدول من TypeScript إلى _common.py.",
            )


class Phones(unittest.TestCase):
    def canon(self, raw: str):
        return nc.normalize_phone(raw, pick_first=False)

    def test_every_shape_reaches_one_form(self):
        for raw in ("01012345678", "+201012345678", "00201012345678",
                    "201012345678", "1012345678", "٠١٠١٢٣٤٥٦٧٨",
                    "010 1234 5678", "(010) 1234-5678"):
            value, status, _ = self.canon(raw)
            self.assertEqual(value, "01012345678", f"{raw} → {value} ({status})")

    def test_landline_refused_not_guessed(self):
        _, status, _ = self.canon("0233334444")
        self.assertEqual(status, "not_mobile")

    def test_scientific_notation_is_refused_never_expanded(self):
        _, status, _ = self.canon("1.01234568E+10")
        self.assertEqual(status, "unrecoverable_precision")

    def test_scientific_notation_expanded_when_lossless(self):
        value, status, _ = self.canon("1.012345678E+9")
        self.assertEqual((value, status), ("01012345678", "fixed"))

    def test_two_numbers_left_for_a_human_by_default(self):
        value, status, note = self.canon("01012345678 / 01112345670")
        self.assertEqual(status, "multiple")
        self.assertIn("01112345670", note)

    def test_picked_is_a_resolved_status(self):
        value, status, _ = nc.normalize_phone("01012345678 / 01112345670", pick_first=True)
        self.assertEqual((value, status), ("01012345678", "picked"))

    def test_space_is_ambiguous_and_both_readings_are_tried(self):
        self.assertEqual(self.canon("0100 123 4567")[0], "01001234567")
        self.assertEqual(self.canon("01012345678 01112345670")[1], "multiple")


class NationalIds(unittest.TestCase):
    def test_exactly_fourteen(self):
        self.assertEqual(nc.normalize_national_id("3 0101 01 12 01234")[0], "30101011201234")
        self.assertEqual(nc.normalize_national_id("301010112012")[1], "bad_length")

    def test_implausible_passes_but_is_flagged(self):
        value, status, note = nc.normalize_national_id("90101019901234")
        self.assertEqual(value, "90101019901234")
        self.assertEqual(status, "suspect")
        self.assertIn("القرن", note)


class Names(unittest.TestCase):
    def test_stored_name_keeps_its_spelling(self):
        for name in ("سارة إبراهيم", "منى سيد", "عبد الله"):
            self.assertEqual(nn.safe_normalize(name), name)

    def test_representation_is_repaired_without_changing_letters(self):
        self.assertEqual(nn.safe_normalize("  محمَّد   عبد اللـه  "), "محمد عبد الله")
        self.assertEqual(nn.safe_normalize("کریم فؤاد"), "كريم فؤاد")
        self.assertEqual(nn.safe_normalize("ﻣﺤﻤﺪ ﺣﺴﻦ"), "محمد حسن")

    def test_match_key_is_aggressive_and_never_stored(self):
        same = ("سارة إبراهيم", "ساره ابراهيم")
        self.assertEqual(nn.match_key(same[0]), nn.match_key(same[1]))
        self.assertNotEqual(nn.safe_normalize(same[0]), nn.safe_normalize(same[1]))

    def test_word_order_and_compound_names(self):
        self.assertEqual(nn.match_key("محمد أحمد علي"), nn.match_key("علي محمد احمد"))
        self.assertEqual(nn.match_key("عبدالرحمن محمود"), nn.match_key("عبد الرحمن محمود"))

    def test_mixed_script_is_reported(self):
        self.assertEqual(nn.inspect("عمر حسن Jud")[0], "script_mixed")
        self.assertEqual(nn.inspect("01098765432")[0], "looks_numeric")
        self.assertEqual(nn.inspect("")[0], "empty")


class Validate(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def test_rejects_what_the_importer_drops_and_blanks_what_it_should_not(self):
        src = write(self.tmp / "in.csv", [
            ["الاسم", "رقم الهاتف", "الرقم القومي", "بريد ولي الأمر"],
            ["أحمد", "01012345678", "30101011201234", "a@b.com"],
            ["سارة", "01112345679", "", "لا يوجد"],
            ["", "01223456780", "", ""],
            ["عمر", "0233334444", "", ""],
            ["منى", "01512345678", "3010101120", ""],
        ])
        out, rej = self.tmp / "out.csv", self.tmp / "rej.csv"
        r = run("validate.py", "--in", str(src), "--out", str(out), "--rejected", str(rej))
        self.assertEqual(r.returncode, 0, r.stderr)

        kept = read(out)
        self.assertEqual(len(kept), 3, "الرأس + صفّان مقبولان")
        self.assertEqual(kept[2][3], "", "«لا يوجد» فُرِّغ ولم يُرفض الصف")

        rejected = read(rej)
        self.assertEqual(rejected[0][-1], "reason", "reconcile.py يقرأ هذا العمود")
        reasons = " ".join(row[-1] for row in rejected[1:])
        for code in ("name_required", "invalid_phone", "invalid_national_id"):
            self.assertIn(code, reasons)

    def test_guardian_email_blanking_keeps_the_safety_gate_shut(self):
        src = write(self.tmp / "g.csv", [
            ["الاسم", "بريد ولي الأمر"],
            ["أحمد", "-"], ["سارة", "غير متاح"], ["عمر", "real@mail.com"],
        ])
        out = self.tmp / "g-out.csv"
        run("validate.py", "--in", str(src), "--out", str(out))
        kept = read(out)
        self.assertEqual([row[1] for row in kept[1:]], ["", "", "real@mail.com"])

    def test_balance_holds(self):
        src = write(self.tmp / "b.csv", [["الاسم"], ["أ"], [""], ["ب"]])
        r = run("validate.py", "--in", str(src))
        self.assertIn("متزن", r.stdout)


class Reconcile(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.src = write(self.tmp / "src.csv", [
            ["الاسم", "رقم الهاتف"], ["أحمد", "01012345678"], ["سارة", "01112345679"]])
        self.imp = self.src

    def response(self, rows, **over):
        body = {"dryRun": False, "total": len(rows), "created": len(rows), "reused": 0,
                "duplicatesInFile": 0, "failed": 0, "rows": rows}
        body.update(over)
        p = self.tmp / "resp.json"
        p.write_text(json.dumps(body, ensure_ascii=False), encoding="utf-8")
        return p

    def test_balanced_run_exits_zero_and_writes_a_crosswalk(self):
        resp = self.response([
            {"line": 2, "name": "أحمد", "status": "created", "studentCode": "G1", "studentId": "u1"},
            {"line": 3, "name": "سارة", "status": "created", "studentCode": "G2", "studentId": "u2"},
        ])
        out = self.tmp / "rep"
        r = run("reconcile.py", "--source", str(self.src), "--import-file", str(self.imp),
                "--response", str(resp), "--out-dir", str(out))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue((out / "crosswalk.csv").exists())

    def test_a_slipped_join_stops_everything(self):
        resp = self.response([
            {"line": 2, "name": "شخص آخر", "status": "created", "studentCode": "G1"},
            {"line": 3, "name": "سارة", "status": "created", "studentCode": "G2"},
        ])
        r = run("reconcile.py", "--source", str(self.src), "--import-file", str(self.imp),
                "--response", str(resp), "--out-dir", str(self.tmp / "r2"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("منزلق", r.stderr)

    def test_a_row_with_no_response_is_caught(self):
        resp = self.response([
            {"line": 2, "name": "أحمد", "status": "created", "studentCode": "G1"}])
        r = run("reconcile.py", "--source", str(self.src), "--import-file", str(self.imp),
                "--response", str(resp), "--out-dir", str(self.tmp / "r3"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("بلا ردّ", r.stderr)

    def test_a_dry_run_is_refused(self):
        resp = self.response([
            {"line": 2, "name": "أحمد", "status": "would_create"},
            {"line": 3, "name": "سارة", "status": "would_create"}], dryRun=True)
        r = run("reconcile.py", "--source", str(self.src), "--import-file", str(self.imp),
                "--response", str(resp), "--out-dir", str(self.tmp / "r4"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("dryRun", r.stderr)


class Xlsx(unittest.TestCase):
    def test_numbers_keep_every_digit(self):
        tmp = Path(tempfile.mkdtemp())
        path = tmp / "book.xlsx"
        sheet = ('<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org'
                 '/spreadsheetml/2006/main"><sheetData>'
                 '<row r="1"><c r="A1" t="inlineStr"><is><t>الاسم</t></is></c>'
                 '<c r="B1" t="inlineStr"><is><t>الرقم القومي</t></is></c></row>'
                 '<row r="2"><c r="A2" t="inlineStr"><is><t>أحمد</t></is></c>'
                 '<c r="B2"><v>30101011201234</v></c></row>'
                 '</sheetData></worksheet>')
        with zipfile.ZipFile(path, "w") as z:
            z.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://sch'
                                              'emas.openxmlformats.org/package/2006/content-types"/>')
            z.writestr("xl/workbook.xml", '<?xml version="1.0"?><workbook xmlns="http://schem'
                       'as.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schema'
                       's.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet'
                       ' name="كشف" sheetId="1" r:id="rId1"/></sheets></workbook>')
            z.writestr("xl/_rels/workbook.xml.rels", '<?xml version="1.0"?><Relationships xml'
                       'ns="http://schemas.openxmlformats.org/package/2006/relationships"><Re'
                       'lationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>')
            z.writestr("xl/worksheets/sheet1.xml", sheet)

        r = run("extract_tables.py", "--in", str(path), "--out-dir", str(tmp))
        self.assertEqual(r.returncode, 0, r.stderr)
        rows = read(tmp / "book.كشف.csv")
        self.assertEqual(rows[1][1], "30101011201234")
        self.assertNotIn("E+", rows[1][1])


class Preflight(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def rows(self, header, n=8, phone=lambda i: f"010123456{i:02d}",
             nid=lambda i: f"3010101120{i:04d}"):
        return [header] + [[f"طالب {i}", phone(i), nid(i)] for i in range(n)]

    def test_clean_file_passes(self):
        src = write(self.tmp / "ok.csv",
                    self.rows(["الاسم", "رقم الهاتف", "الرقم القومي"]))
        r = run("preflight.py", "--in", str(src))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("صالح للرفع", r.stdout)

    def test_swapped_columns_are_caught(self):
        src = write(self.tmp / "swap.csv",
                    self.rows(["الاسم", "رقم الهاتف", "الرقم القومي"],
                              phone=lambda i: f"3010101120{i:04d}",
                              nid=lambda i: f"010123456{i:02d}"))
        r = run("preflight.py", "--in", str(src))
        self.assertEqual(r.returncode, 1)
        self.assertIn("متبادلان", r.stderr)

    def test_force_overrides_suspicion_but_not_a_missing_name_column(self):
        src = write(self.tmp / "swap2.csv",
                    self.rows(["الاسم", "رقم الهاتف", "الرقم القومي"],
                              phone=lambda i: f"3010101120{i:04d}",
                              nid=lambda i: f"010123456{i:02d}"))
        self.assertEqual(run("preflight.py", "--in", str(src), "--force").returncode, 0)

        noname = write(self.tmp / "noname.csv", [["كود", "تليفون"], ["A1", "01012345678"]])
        r = run("preflight.py", "--in", str(noname), "--force")
        self.assertEqual(r.returncode, 1, "غياب عمود الاسم لا يتجاوزه --force")
        self.assertIn("عمود اسم", r.stderr)

    def test_a_tiny_column_is_not_judged(self):
        src = write(self.tmp / "small.csv",
                    [["الاسم", "رقم الهاتف"], ["أحمد", "0233334444"], ["سارة", ""]])
        r = run("preflight.py", "--in", str(src))
        self.assertEqual(r.returncode, 0, r.stderr)


class MultiSource(unittest.TestCase):
    def test_several_source_files_balance_against_one_import_file(self):
        tmp = Path(tempfile.mkdtemp())
        a = write(tmp / "a.csv", [["الاسم"], ["أحمد"], ["سارة"]])
        b = write(tmp / "b.csv", [["الاسم"], ["عمر"]])
        both = write(tmp / "all.csv", [["الاسم"], ["أحمد"], ["سارة"], ["عمر"]])
        r = run("reconcile.py", "--source", str(a), "--source", str(b),
                "--import-file", str(both), "--out-dir", str(tmp / "out"))
        self.assertEqual(r.returncode, 0, r.stderr)
        report = (tmp / "out" / "migration-report.md").read_text(encoding="utf-8")
        self.assertIn("المصادر (2)", report)
        self.assertIn("| صفوف المصادر (غير الفارغة) | 3 |", report)

    def test_a_missing_source_file_unbalances_the_sum(self):
        tmp = Path(tempfile.mkdtemp())
        a = write(tmp / "a.csv", [["الاسم"], ["أحمد"], ["سارة"]])
        both = write(tmp / "all.csv", [["الاسم"], ["أحمد"], ["سارة"], ["عمر"]])
        r = run("reconcile.py", "--source", str(a), "--import-file", str(both),
                "--out-dir", str(tmp / "out"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("مختل", r.stderr)


def word(text: str, left: int, top: int, w: int = 60, h: int = 20,
         conf: float = 95.0, line=(1, 1, 1)) -> dict:
    return {"text": text, "conf": conf, "left": left, "top": top,
            "width": w, "height": h, "line": line}


class OcrGeometry(unittest.TestCase):
    """
    الهندسة التي تبني الجدول من كلمات مبعثرة — وهي موضع **كل** عيب وقع في مسار
    المسح. المحرّك نفسه لم يكن العطب في أي منها، فهذه الاختبارات لا تحتاج
    tesseract ولا صورة، وتعمل في أي مكان.
    """

    def test_page_margin_is_not_a_column_separator(self):
        words = [word("اسم", 400, 10), word("012", 900, 10)]
        bounds = et.find_column_bounds(words)
        self.assertEqual(len(bounds), 1, f"حدود: {bounds}")
        self.assertLess(400, bounds[0])
        self.assertLess(bounds[0], 900)

    def test_table_rules_are_dropped_before_columns_are_found(self):
        for glyph in ("|", "—", "__", "="):
            self.assertRegex(glyph, et.BORDER_RE)
        for real in ("علي", "01012345678", "3-أ"):
            self.assertNotRegex(real, et.BORDER_RE)

    def test_rows_group_by_geometry_not_by_the_engine_line_ids(self):
        words = [
            word("أ", 100, 100, line=(1, 1, 1)), word("ب", 500, 104, line=(2, 1, 1)),
            word("ج", 100, 200, line=(3, 1, 1)), word("د", 500, 197, line=(4, 1, 1)),
        ]
        rows = et.group_rows(words)
        self.assertEqual([len(r) for r in rows], [2, 2])

    def test_grid_reads_right_to_left_for_arabic(self):
        words = [word("الاسم", 900, 10), word("رقم الهاتف", 400, 10),
                 word("أحمد", 900, 100), word("01012345678", 400, 100)]
        grid, confs = et.build_grid(words, rtl=True)
        self.assertEqual(grid[0][0], "الاسم", "العمود الأول في العربية هو الأيمن")
        self.assertEqual(grid[1], ["أحمد", "01012345678"])
        self.assertEqual(len(confs), len(grid))

    def test_a_recognised_header_row_is_detected_and_a_data_row_is_not(self):
        self.assertIsNotNone(et.header_from(["الاسم", "رقم الهاتف", "الرقم القومي"]))
        self.assertIsNone(et.header_from(["أحمد محمد", "01012345678", "30101011201234"]))


class XlsxInternals(unittest.TestCase):
    def test_cell_reference_to_column_index(self):
        self.assertEqual((et.col_index("A1"), et.col_index("B2"), et.col_index("AB7")),
                         (0, 1, 27))

    def test_excel_serial_to_a_real_date(self):
        self.assertEqual(et.serial_to_iso(38000, False), "2004-01-14")
        self.assertEqual(et.serial_to_iso(1, False), "1900-01-01")

    def test_numbers_never_come_out_scientific_or_with_a_trailing_zero(self):
        self.assertEqual(et.num_to_text("30101011201234"), "30101011201234")
        self.assertEqual(et.num_to_text("1012345678"), "1012345678")
        self.assertNotIn("e", et.num_to_text("30101011201234").lower())

    def test_date_formats_are_told_apart_from_currency(self):
        self.assertTrue(et.is_date_format("dd/mm/yyyy"))
        self.assertFalse(et.is_date_format('#,##0.00 "ج.م"'))


def _ocr_ready() -> bool:
    if not shutil.which("tesseract"):
        return False
    try:
        import PIL  # noqa: F401
    except ImportError:
        return False
    return not et.preflight_ocr("eng")


@unittest.skipUnless(_ocr_ready(), "tesseract أو Pillow غير متاح — يُتخطّى")
class OcrLive(unittest.TestCase):
    """
    تشغيل حقيقي للمحرّك، ويُتخطّى حين لا يكون مثبتًا (وهو حال CI). لاتينيٌّ
    عمدًا: رسم العربية يحتاج تشكيلًا لا تملكه Pillow هنا، وصورةٌ بحروف منفصلة
    مقلوبة تجعل الاختبار كاذبًا بلا أن يبدو كذلك.
    """

    def test_a_printed_table_becomes_a_grid(self):
        from PIL import Image, ImageDraw, ImageFont
        tmp = Path(tempfile.mkdtemp())
        img = Image.new("L", (1200, 260), 255)
        d = ImageDraw.Draw(img)
        try:
            f = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 28)
        except OSError:
            f = ImageFont.load_default()
        for r, row in enumerate((("Name", "Phone"), ("Ahmed", "01012345678"),
                                 ("Sara", "01112345679"))):
            for x, cell in zip((40, 600), row):
                d.text((x, 40 + r * 70), cell, font=f, fill=0)
        path = tmp / "t.png"
        img.save(path)

        r = run("extract_tables.py", "--in", str(path), "--out-dir", str(tmp),
                "--lang", "eng", "--ltr")
        self.assertEqual(r.returncode, 0, r.stderr)
        rows = read(tmp / "t.csv")
        self.assertEqual(rows[0][:2], ["Name", "Phone"])
        self.assertEqual(len(rows), 3, f"رأس + صفّان، لا {len(rows)}")
        self.assertEqual(rows[1][1], "01012345678")
        self.assertEqual(rows[1][-1], "scan")

    def test_every_numeric_cell_lands_in_the_review_file(self):
        from PIL import Image, ImageDraw, ImageFont
        tmp = Path(tempfile.mkdtemp())
        img = Image.new("L", (900, 200), 255)
        d = ImageDraw.Draw(img)
        try:
            f = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 28)
        except OSError:
            f = ImageFont.load_default()
        d.text((40, 40), "Name", font=f, fill=0)
        d.text((500, 40), "Phone", font=f, fill=0)
        d.text((40, 120), "Ahmed", font=f, fill=0)
        d.text((500, 120), "01012345678", font=f, fill=0)
        path = tmp / "n.png"
        img.save(path)

        run("extract_tables.py", "--in", str(path), "--out-dir", str(tmp),
            "--lang", "eng", "--ltr")
        review = read(tmp / "n.review.csv")
        self.assertTrue(any("01012345678" in row for row in review[1:]),
                        f"الخانة الرقمية ليست في ملف المراجعة: {review}")


class Importer(unittest.TestCase):
    def test_quoted_newline_is_one_record(self):
        header, rows = import_students.split_records(
            'الاسم,ولي الأمر\nأحمد,"سطر\nوسطر"\nسارة,خالد\n')
        self.assertEqual(len(rows), 2)

    def test_blank_lines_do_not_shift_the_offset(self):
        _, rows = import_students.split_records("h\na\n\n\nb\n")
        self.assertEqual(rows, ["a", "b"])

    def test_merge_keeps_every_row_and_sums_the_counts(self):
        merged = import_students.merge([
            {"total": 2, "created": 2, "reused": 0, "duplicatesInFile": 0, "failed": 0,
             "rows": [{"line": 2}, {"line": 3}]},
            {"total": 1, "created": 0, "reused": 1, "duplicatesInFile": 0, "failed": 0,
             "rows": [{"line": 4}]},
        ], dry_run=False)
        self.assertEqual((merged["total"], merged["created"], merged["reused"]), (3, 2, 1))
        self.assertEqual([r["line"] for r in merged["rows"]], [2, 3, 4])


if __name__ == "__main__":
    unittest.main(verbosity=2)
