// =============================================================================
// REPORT EXPORT — the numbers on the screen, in a file the accountant can open.
//
// THE ONE RULE THIS MODULE EXISTS TO ENFORCE: an export runs the SAME service
// function the screen runs. It issues no queries of its own. A report that
// re-derives its own totals is a second set of books, and the first time the
// printed sheet disagrees with the dashboard nobody can say which one is
// wrong. So each entry below is a MAPPING from an existing report's output to
// columns and rows — never a new read.
//
// AUTHORIZATION TRAVELS WITH THE REPORT. Each entry carries the same staff
// tier its own endpoint uses (5 are accountant-tier, 3 are manager-tier). The
// export route reads `tier` from this table rather than holding a list of its
// own, so opening a report to a tier can never quietly open its export to a
// different one.
//
// WHY CSV AND NOT .xlsx: a real xlsx writer is a dependency, and CSV is what
// every spreadsheet on a center's desk opens. The two details that make CSV
// actually work here are handled below and are easy to get wrong: the UTF-8
// BOM (without it Excel renders every Arabic name as mojibake) and formula
// neutralisation (without it a course titled `=...` executes when the file is
// opened). PDF is a separate path — the print route — because the browser's
// own engine shapes Arabic correctly with no dependency at all.
// =============================================================================

import type { CenterStaffRole } from "@repo/database";
import type { SessionUser } from "../../auth/types";
import { BusinessRuleError } from "../../errors/classes";
import type { ProvenanceFilter } from "./reports";
import {
  getAttendanceByCourse,
  getCourseFillRates,
  getEnrollmentFunnel,
  getExpensesReport,
  getExpensesTimeseries,
  getNetProfitReport,
  getRevenueTimeseries,
} from "./reports";

export type ExportTier = "accountant" | "manager";

/**
 * Which staff sub-roles each tier admits.
 *
 * These MUST equal the `ACCOUNTANT` / `MANAGER` constants in apps/www's
 * center-actor.ts, which are what the report endpoints themselves gate on.
 * They are restated here because the kernel cannot import from the app — and
 * because restating them silently is how they drift, `tests/unit/
 * report-export-tiers.test.ts` asserts set-equality against the real
 * constants. Note the asymmetry that makes this worth guarding: the accountant
 * tier is `center_accountant` ALONE — a manager may read attendance and fill
 * rates but NOT revenue.
 */
export const EXPORT_TIER_ROLES: Record<ExportTier, readonly CenterStaffRole[]> = {
  accountant: ["center_accountant"],
  manager: ["manager"],
};

export type ExportColumn = {
  key: string;
  header: { ar: string; en: string };
  /** money = piasters rendered as plain decimal EGP; number/percent stay raw. */
  type?: "text" | "money" | "number" | "percent";
};

export type ExportTable = {
  columns: ExportColumn[];
  rows: Record<string, string | number | null>[];
  /** Rendered as a final emphasised line (Excel sees an ordinary row). */
  totalRow?: Record<string, string | number | null>;
};

export type ReportExportKey =
  | "net-profit"
  | "revenue-timeseries"
  | "expenses-timeseries"
  | "expenses"
  | "revenue-by-course"
  | "course-fill-rates"
  | "attendance-by-course"
  | "enrollment-funnel"
  | "shift-reconciliation";

type LoadArgs = {
  user: SessionUser;
  from?: string;
  to?: string;
  provenance?: ProvenanceFilter;
};

type ReportDef = {
  tier: ExportTier;
  title: { ar: string; en: string };
  load: (args: LoadArgs) => Promise<ExportTable>;
};

const money = (type: ExportColumn["type"] = "money") => type;

// ---------------------------------------------------------------------------
// The registry. Adding a report here is the whole cost of exporting it.
// ---------------------------------------------------------------------------

export const REPORT_EXPORTS: Record<ReportExportKey, ReportDef> = {
  "net-profit": {
    tier: "accountant",
    title: { ar: "كشف الأرباح والخسائر", en: "Profit and loss statement" },
    load: async ({ user, from, to }) => {
      const r = await getNetProfitReport(user, from, to);
      const rows = r.monthly.map((m) => ({
        month: m.month,
        revenue: m.revenue,
        expenses: m.expenses,
        net: m.revenue - m.expenses,
      }));
      return {
        columns: [
          { key: "month", header: { ar: "الشهر", en: "Month" }, type: "text" },
          { key: "revenue", header: { ar: "الإيرادات", en: "Revenue" }, type: money() },
          { key: "expenses", header: { ar: "المصروفات", en: "Expenses" }, type: money() },
          { key: "net", header: { ar: "الصافي", en: "Net" }, type: money() },
        ],
        rows,
        // The headline figures come from the report itself, NOT from summing
        // the rows above — if a month were ever missing from the breakdown the
        // total must still be the true one, and the discrepancy must show.
        totalRow: {
          month: "—",
          revenue: r.revenue,
          expenses: r.expenses,
          net: r.netProfit,
        },
      };
    },
  },

  "revenue-by-course": {
    tier: "accountant",
    title: { ar: "الإيرادات حسب المجموعة", en: "Revenue by group" },
    load: async ({ user, from, to }) => {
      const r = await getNetProfitReport(user, from, to);
      return {
        columns: [
          { key: "title", header: { ar: "المجموعة", en: "Group" }, type: "text" },
          { key: "revenue", header: { ar: "الإيرادات", en: "Revenue" }, type: money() },
          { key: "pct", header: { ar: "النسبة %", en: "Share %" }, type: "percent" },
        ],
        rows: r.byCourse.map((c) => ({ title: c.title, revenue: c.revenue, pct: c.pct })),
        totalRow: { title: "—", revenue: r.revenue, pct: 100 },
      };
    },
  },

  "revenue-timeseries": {
    tier: "accountant",
    title: { ar: "الإيرادات عبر الزمن", en: "Revenue over time" },
    load: async ({ user, from, to }) => {
      const r = await getRevenueTimeseries(user, from, to, "month");
      return {
        columns: [
          { key: "period", header: { ar: "الفترة", en: "Period" }, type: "text" },
          { key: "revenue", header: { ar: "الإيرادات", en: "Revenue" }, type: money() },
          { key: "expenses", header: { ar: "المصروفات", en: "Expenses" }, type: money() },
        ],
        rows: r.series.map((s) => ({
          period: s.period,
          revenue: s.revenue,
          expenses: s.expenses,
        })),
      };
    },
  },

  "expenses-timeseries": {
    tier: "accountant",
    title: { ar: "المصروفات عبر الزمن", en: "Expenses over time" },
    load: async ({ user, from, to }) => {
      const r = await getExpensesTimeseries(user, from, to, "month");
      return {
        columns: [
          { key: "period", header: { ar: "الفترة", en: "Period" }, type: "text" },
          { key: "expenses", header: { ar: "المصروفات", en: "Expenses" }, type: money() },
        ],
        rows: r.series.map((s) => ({ period: s.period, expenses: s.total })),
      };
    },
  },

  expenses: {
    tier: "accountant",
    title: { ar: "المصروفات حسب البند", en: "Expenses by category" },
    load: async ({ user, from, to }) => {
      const r = await getExpensesReport(user, from, to);
      return {
        columns: [
          { key: "category", header: { ar: "البند", en: "Category" }, type: "text" },
          { key: "amount", header: { ar: "المبلغ", en: "Amount" }, type: money() },
          { key: "count", header: { ar: "العدد", en: "Count" }, type: "number" },
        ],
        rows: r.byCategory.map((c) => ({
          category: c._id,
          amount: c.subtotal,
          count: c.count,
        })),
        totalRow: { category: "—", amount: r.total, count: null },
      };
    },
  },

  "course-fill-rates": {
    tier: "manager",
    title: { ar: "نسبة إشغال المجموعات", en: "Group fill rates" },
    load: async ({ user, provenance }) => {
      const r = await getCourseFillRates(user, provenance);
      return {
        columns: [
          { key: "title", header: { ar: "المجموعة", en: "Group" }, type: "text" },
          { key: "enrolled", header: { ar: "المسجّلون", en: "Enrolled" }, type: "number" },
          { key: "maxStudents", header: { ar: "السعة", en: "Capacity" }, type: "number" },
          { key: "fillRatePct", header: { ar: "الإشغال %", en: "Fill %" }, type: "percent" },
        ],
        rows: r.items.map((i) => ({
          title: i.title,
          enrolled: i.enrolled,
          maxStudents: i.maxStudents,
          fillRatePct: i.fillRatePct,
        })),
      };
    },
  },

  "attendance-by-course": {
    tier: "manager",
    title: { ar: "الحضور حسب المجموعة", en: "Attendance by group" },
    load: async ({ user, from, to, provenance }) => {
      const r = await getAttendanceByCourse(user, from, to, provenance);
      return {
        columns: [
          { key: "title", header: { ar: "المجموعة", en: "Group" }, type: "text" },
          { key: "present", header: { ar: "حاضر", en: "Present" }, type: "number" },
          { key: "absent", header: { ar: "غائب", en: "Absent" }, type: "number" },
          { key: "excused", header: { ar: "بعذر", en: "Excused" }, type: "number" },
          { key: "attendanceRatePct", header: { ar: "النسبة %", en: "Rate %" }, type: "percent" },
        ],
        rows: r.items.map((i) => ({
          title: i.title,
          present: i.present,
          absent: i.absent,
          excused: i.excused,
          attendanceRatePct: i.attendanceRatePct,
        })),
      };
    },
  },

  "enrollment-funnel": {
    tier: "manager",
    title: { ar: "مسار طلبات التسجيل", en: "Enrollment funnel" },
    load: async ({ user, from, to }) => {
      const r = await getEnrollmentFunnel(user, from, to);
      return {
        columns: [
          { key: "status", header: { ar: "الحالة", en: "Status" }, type: "text" },
          { key: "count", header: { ar: "العدد", en: "Count" }, type: "number" },
        ],
        rows: r.items.map((i) => ({ status: i.status, count: i.count })),
      };
    },
  },

  // Phase 2 (revenue-operations spec §2.4): the drawer reconciliation. Runs
  // listShiftReconciliation — the SAME function the shifts screen reads — so
  // the export can never be a second set of books.
  "shift-reconciliation": {
    tier: "accountant",
    title: { ar: "تسوية الورديات والدرج", en: "Shift and drawer reconciliation" },
    load: async ({ user, from, to }) => {
      const { listShiftReconciliation } = await import("../center/shifts");
      const rows = await listShiftReconciliation(user, { from, to });
      return {
        columns: [
          { key: "openedAt", header: { ar: "فُتحت", en: "Opened" }, type: "text" },
          { key: "closedAt", header: { ar: "أُقفلت", en: "Closed" }, type: "text" },
          { key: "staffName", header: { ar: "الموظف", en: "Staff" }, type: "text" },
          { key: "openingFloat", header: { ar: "رصيد البداية", en: "Opening float" }, type: money() },
          { key: "cashNet", header: { ar: "صافي الكاش", en: "Cash net" }, type: money() },
          { key: "expectedCash", header: { ar: "المتوقع في الدرج", en: "Expected cash" }, type: money() },
          { key: "countedCash", header: { ar: "المعدود", en: "Counted cash" }, type: money() },
          { key: "variance", header: { ar: "الفرق", en: "Variance" }, type: money() },
          { key: "bankNet", header: { ar: "بنكي (إنستاباي + POS)", en: "Bank (InstaPay + POS)" }, type: money() },
          { key: "providerNet", header: { ar: "محافظ الموبايل", en: "Mobile wallets" }, type: money() },
          { key: "note", header: { ar: "ملاحظة", en: "Note" }, type: "text" },
        ],
        rows: rows.map((r) => ({
          // ISO strings — ExportColumn has no date type; text keeps the CSV
          // unambiguous and sortable.
          openedAt: r.openedAt.toISOString(),
          closedAt: r.closedAt ? r.closedAt.toISOString() : "",
          staffName: r.staffName,
          openingFloat: r.openingFloat,
          cashNet: r.cashNet,
          expectedCash: r.expectedCash,
          countedCash: r.countedCash,
          variance: r.variance,
          bankNet: r.bankNet,
          providerNet: r.providerNet,
          note: r.note,
        })),
      };
    },
  },
};

export function isReportExportKey(v: string): v is ReportExportKey {
  return Object.prototype.hasOwnProperty.call(REPORT_EXPORTS, v);
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Money is stored in piasters. Excel needs a plain decimal to SUM it. */
function piastersToEgp(v: number): string {
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(v));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Neutralise spreadsheet formula injection.
 *
 * Course titles, expense categories and student names are typed by users. A
 * cell whose text begins with = + - @ (or a control character Excel treats as
 * a formula lead-in) is EXECUTED when the file is opened — the classic CSV
 * injection, and an accountant's machine is exactly where it pays off. The
 * value is preserved and rendered as text by prefixing an apostrophe, which
 * every spreadsheet strips on display.
 *
 * Numbers are formatted by us and never pass through here, so a negative
 * amount keeps its minus sign and stays numeric.
 */
function neutralise(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvCell(value: string): string {
  // RFC 4180: quote when the value contains a delimiter, a quote or a newline;
  // a literal quote is doubled.
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function formatValue(value: string | number | null, type: ExportColumn["type"]): string {
  if (value === null || value === undefined) return "";
  if (type === "money" && typeof value === "number") return piastersToEgp(value);
  if (typeof value === "number") return String(value);
  return neutralise(String(value));
}

export type CsvOptions = {
  locale?: "ar" | "en";
  /** Written above the table as context: report title, range, center. */
  meta?: { label: string; value: string }[];
  title?: string;
};

/**
 * Render a table as CSV bytes Excel opens correctly.
 *
 * Two non-obvious requirements, both load-bearing:
 *   * the UTF-8 BOM — Excel assumes the system codepage without it, and every
 *     Arabic name in the file becomes mojibake;
 *   * CRLF line endings — what Excel's importer expects.
 */
export function toCsv(table: ExportTable, opts: CsvOptions = {}): string {
  const locale = opts.locale ?? "ar";
  const lines: string[] = [];

  if (opts.title) lines.push(csvCell(neutralise(opts.title)));
  for (const m of opts.meta ?? []) {
    lines.push([csvCell(neutralise(m.label)), csvCell(neutralise(m.value))].join(","));
  }
  if (opts.title || opts.meta?.length) lines.push("");

  lines.push(table.columns.map((c) => csvCell(c.header[locale])).join(","));
  for (const row of table.rows) {
    lines.push(
      table.columns.map((c) => csvCell(formatValue(row[c.key] ?? null, c.type))).join(","),
    );
  }
  if (table.totalRow) {
    lines.push(
      table.columns
        .map((c) => csvCell(formatValue(table.totalRow![c.key] ?? null, c.type)))
        .join(","),
    );
  }

  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** `net-profit-2026-08-09.csv` — sortable, and safe as a filename. */
export function exportFilename(key: ReportExportKey, stamp: string): string {
  return `${key}-${stamp.slice(0, 10)}.csv`;
}

/**
 * Load one report as an export table, enforcing the report's OWN staff tier.
 *
 * `staffRole` is null for the center owner, who passes everything. A staff
 * member passes only the tier their own report endpoint would admit — read
 * from the registry, so the export and the report can never drift apart.
 */
export async function buildReportExport(
  args: LoadArgs & { key: ReportExportKey; staffRole: string | null },
): Promise<{ table: ExportTable; def: ReportDef }> {
  const def = REPORT_EXPORTS[args.key];
  if (!def) throw new BusinessRuleError("Unknown report");

  if (args.staffRole !== null) {
    const allowed = (EXPORT_TIER_ROLES[def.tier] as readonly string[]).includes(args.staffRole);
    if (!allowed) {
      throw new BusinessRuleError("This staff role cannot export this report", {
        code: "forbidden_report",
      });
    }
  }

  const table = await def.load(args);
  return { table, def };
}
