import ExcelJS from "exceljs";
import { toDateKey, todayKey } from "@repo/server-core/lib/date-key";
import { listSessionSettlements, type SettlementFilters } from "@/lib/services/admin/session-settlements";

const EGP_FORMAT = '#,##0.00\\ "EGP"';

const toPounds = (piasters: number | null | undefined) => (piasters ?? 0) / 100;

type Column = {
  header: string;
  key: string;
  width: number;
  money?: boolean;
};

const COLUMNS: Record<"ar" | "en", Column[]> = {
  ar: [
    { header: "التاريخ", key: "date", width: 12 },
    { header: "المركز", key: "centerName", width: 26 },
    { header: "المدرّس", key: "teacherName", width: 24 },
    { header: "الفصل", key: "courseTitle", width: 26 },
    { header: "القاعة", key: "roomName", width: 18 },
    { header: "طريقة التسعير", key: "pricingMethod", width: 20 },
    { header: "سعر الحصة", key: "perSessionPrice", width: 15, money: true },
    { header: "الحضور وقت التسوية", key: "presentCount", width: 18 },
    { header: "الحضور الحالي", key: "livePresentCount", width: 15 },
    { header: "الفرق", key: "countDelta", width: 10 },
    { header: "نصيب المنصة", key: "platformTotal", width: 16, money: true },
    { header: "نصيب المركز", key: "centerTotal", width: 16, money: true },
    { header: "صافي المدرّس", key: "teacherTotal", width: 16, money: true },
    { header: "رقم الحصة", key: "sessionId", width: 38 },
  ],
  en: [
    { header: "Date", key: "date", width: 12 },
    { header: "Center", key: "centerName", width: 26 },
    { header: "Teacher", key: "teacherName", width: 24 },
    { header: "Class", key: "courseTitle", width: 26 },
    { header: "Room", key: "roomName", width: 18 },
    { header: "Pricing method", key: "pricingMethod", width: 20 },
    { header: "Session price", key: "perSessionPrice", width: 15, money: true },
    { header: "Present at settlement", key: "presentCount", width: 20 },
    { header: "Present now", key: "livePresentCount", width: 14 },
    { header: "Delta", key: "countDelta", width: 10 },
    { header: "Platform share", key: "platformTotal", width: 16, money: true },
    { header: "Center share", key: "centerTotal", width: 16, money: true },
    { header: "Teacher net", key: "teacherTotal", width: 16, money: true },
    { header: "Session id", key: "sessionId", width: 38 },
  ],
};

const METHOD_LABEL: Record<"ar" | "en", Record<string, string>> = {
  ar: {
    whole_room_percent: "نسبة القاعة كاملة",
    per_attending_student: "لكل طالب حاضر",
    no_room: "بدون قاعة (النموذج الافتراضي)",
  },
  en: {
    whole_room_percent: "Whole-room percent",
    per_attending_student: "Per attending student",
    no_room: "No hall (default model)",
  },
};

const SHEET_TITLE = { ar: "تسويات الحصص", en: "Session settlements" };
const TOTAL_LABEL = { ar: "الإجمالي", en: "Total" };
const NOTE = {
  ar: "الأرقام بالجنيه المصري. «الحضور وقت التسوية» مُجمَّد ولا يُعاد حسابه؛ أي فرق يعني تعديل حضور بعد التسوية.",
  en: "Amounts in EGP. “Present at settlement” is frozen and never re-rated; any delta means attendance was edited after settlement.",
};

const MAX_ROWS = 5000;

export async function buildSettlementWorkbook(
  filters: SettlementFilters,
  locale: "ar" | "en",
): Promise<{ buffer: Buffer; filename: string; rowCount: number; truncated: boolean }> {
  const { settlements, meta } = await listSessionSettlements({ ...filters, page: 1, limit: MAX_ROWS });
  const truncated = meta.total > settlements.length;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Edura";
  const ws = wb.addWorksheet(SHEET_TITLE[locale], {
    views: [
      {
        rightToLeft: locale === "ar",
        state: "frozen",
        ySplit: 1,
      },
    ],
  });

  const columns = COLUMNS[locale];
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  const header = ws.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle" };
  header.border = { bottom: { style: "thin" } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  for (const s of settlements) {
    ws.addRow({
      date: toDateKey(s.createdAt),
      centerName: s.centerName ?? "—",
      teacherName: s.teacherName ?? "—",
      courseTitle: s.courseTitle ?? "—",
      roomName: s.roomName ?? "—",
      pricingMethod: METHOD_LABEL[locale][s.pricingMethod ?? "no_room"] ?? s.pricingMethod,
      perSessionPrice: toPounds(s.perSessionPrice),
      presentCount: s.presentCount,
      livePresentCount: s.livePresentCount,
      countDelta: s.livePresentCount - s.presentCount,
      platformTotal: toPounds(s.platformTotal),
      centerTotal: toPounds(s.centerTotal),
      teacherTotal: toPounds(s.teacherTotal),
      sessionId: s.sessionId,
    });
  }

  for (const [index, col] of columns.entries()) {
    if (!col.money) continue;
    ws.getColumn(index + 1).numFmt = EGP_FORMAT;
  }

  if (settlements.length > 0) {
    const firstDataRow = 2;
    const lastDataRow = settlements.length + 1;
    const totalRow = ws.addRow({});
    totalRow.getCell(1).value = TOTAL_LABEL[locale];
    totalRow.font = { bold: true };
    totalRow.border = { top: { style: "double" } };

    for (const [index, col] of columns.entries()) {
      if (!col.money) continue;
      const letter = ws.getColumn(index + 1).letter;
      const cell = totalRow.getCell(index + 1);
      cell.value = { formula: `SUBTOTAL(109,${letter}${firstDataRow}:${letter}${lastDataRow})` };
      cell.numFmt = EGP_FORMAT;
    }
  }

  ws.addRow({});
  const noteRow = ws.addRow({});
  noteRow.getCell(1).value = NOTE[locale];
  noteRow.getCell(1).font = { size: 9, italic: true };

  if (truncated) {
    const capRow = ws.addRow({});
    capRow.getCell(1).value =
      locale === "ar"
        ? `تنبيه: هذا الملف يحتوي أول ${settlements.length} صف من إجمالي ${meta.total}. ضيّق نطاق التاريخ للحصول على الباقي.`
        : `Note: this file contains the first ${settlements.length} of ${meta.total} rows. Narrow the date range for the rest.`;
    capRow.getCell(1).font = { size: 9, bold: true };
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const stamp = todayKey();

  return {
    buffer,
    filename: `edura-settlements-${stamp}.xlsx`,
    rowCount: settlements.length,
    truncated,
  };
}
