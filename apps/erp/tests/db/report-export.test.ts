import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext, prisma } from "@repo/database";
import {
  buildReportExport,
  exportFilename,
  REPORT_EXPORTS,
  toCsv,
  type ReportExportKey,
} from "@repo/server-core/services/reports/report-export";
import {
  getAttendanceByCourse,
  getCourseFillRates,
  getExpensesReport,
  getNetProfitReport,
} from "@repo/server-core/services/reports/reports";
import type { SessionUser } from "@repo/server-core/erp-auth/session";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗", m)); };

const tag = "rexp-" + Math.floor(Math.random() * 1e9).toString(36);

const FROM = "2026-03-01";
const TO = "2026-03-31";
const inRange = (day: number) => new Date(Date.UTC(2026, 2, day, 10, 0, 0));
const OUT_OF_RANGE = new Date(Date.UTC(2026, 0, 15, 10, 0, 0));

const HOSTILE_TITLE = "=1+1+cmd|'/c calc'!A0";

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = await admin.connect();
  try {
    return (await c.query(sql, params)).rows as T[];
  } finally {
    c.release();
  }
}

async function expectThrows(fn: () => Promise<unknown>, match: RegExp, label: string) {
  try {
    await fn();
    fail++;
    console.error("  ✗", label, "— expected a rejection, got success");
  } catch (e) {
    const msg = (e as Error).message ?? "";
    ok(match.test(msg), `${label} (got: ${msg.slice(0, 70)})`);
  }
}

function csvLines(csv: string): string[] {
  return csv.replace(/^﻿/, "").trimEnd().split("\r\n");
}

function tableLines(csv: string): string[] {
  const lines = csvLines(csv);
  const blank = lines.indexOf("");
  return blank === -1 ? lines : lines.slice(blank + 1);
}

const egp = (piasters: number) => {
  const sign = piasters < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(piasters));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
};

async function moneyCensus(centerIds: string[]) {
  const [p] = await q<{ n: number; sum: string | null }>(
    `SELECT count(*)::int n, sum(amount)::text sum FROM payments WHERE center_id = ANY($1::uuid[])`,
    [centerIds],
  );
  const [e] = await q<{ n: number; sum: string | null }>(
    `SELECT count(*)::int n, sum(amount)::text sum FROM expenses WHERE center_id = ANY($1::uuid[])`,
    [centerIds],
  );
  const [t] = await q<{ n: number }>(
    `SELECT count(*)::int n FROM transactions WHERE center_id = ANY($1::uuid[])`,
    [centerIds],
  );
  return JSON.stringify({ p, e, t });
}

async function main() {
  console.log("Report export —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const centerA = await tx.center.create({
      data: { name: tag + "-A", shortId: (tag + "A").slice(0, 12).toUpperCase(), status: "active", walletBalance: 0, isDemo: true },
    });
    const centerB = await tx.center.create({
      data: { name: tag + "-B", shortId: (tag + "B").slice(0, 12).toUpperCase(), status: "active", walletBalance: 0, isDemo: true },
    });
    const ownerA = await tx.user.create({
      data: { name: tag + "-ownerA", role: "center_admin", email: tag + "-a@x.io", status: "active", isDemo: true },
    });
    const ownerB = await tx.user.create({
      data: { name: tag + "-ownerB", role: "center_admin", email: tag + "-b@x.io", status: "active", isDemo: true },
    });
    const teacher = await tx.user.create({
      data: { name: tag + "-teacher", role: "teacher", email: tag + "-t@x.io", status: "active", isDemo: true },
    });
    const student = await tx.user.create({
      data: { name: tag + "-طالب", role: "student", email: tag + "-s@x.io", status: "active", isDemo: true },
    });

    const courseBase = {
      teacherId: teacher.id,
      subject: "math",
      daysOfWeek: [1],
      startTime: "16:00",
      endTime: "18:00",
      startDate: inRange(1),
      price: 100_00,
      maxStudents: 10,
      status: "active" as const,
      isDemo: true,
    };
    const courseArabic = await tx.course.create({
      data: { ...courseBase, centerId: centerA.id, title: "رياضيات — الصف الثالث" },
    });
    const courseHostile = await tx.course.create({
      data: { ...courseBase, centerId: centerA.id, title: HOSTILE_TITLE },
    });
    const courseB = await tx.course.create({
      data: { ...courseBase, centerId: centerB.id, title: tag + "-B-course" },
    });

    await tx.enrollment.create({
      data: { studentId: student.id, courseId: courseArabic.id, centerId: centerA.id, status: "active", enrolledBy: ownerA.id },
    });

    const session = await tx.session.create({
      data: {
        courseId: courseArabic.id, teacherId: teacher.id,
        originalDate: inRange(9), date: inRange(9),
        startTime: "16:00", endTime: "18:00", status: "completed",
      },
    });
    const sessionOut = await tx.session.create({
      data: {
        courseId: courseArabic.id, teacherId: teacher.id,
        originalDate: OUT_OF_RANGE, date: OUT_OF_RANGE,
        startTime: "16:00", endTime: "18:00", status: "completed",
      },
    });
    await tx.attendanceRecord.create({
      data: {
        sessionId: session.id, studentId: student.id, courseId: courseArabic.id,
        centerId: centerA.id, status: "present", markedBy: ownerA.id,
      },
    });
    await tx.attendanceRecord.create({
      data: {
        sessionId: sessionOut.id, studentId: student.id, courseId: courseArabic.id,
        centerId: centerA.id, status: "absent", markedBy: ownerA.id,
      },
    });

    await tx.payment.create({
      data: {
        centerId: centerA.id, studentId: student.id, courseId: courseArabic.id,
        amount: 300_00, status: "paid", receiptNumber: `${tag}-R1`,
        recordedBy: ownerA.id, paidAt: inRange(5),
      },
    });
    await tx.payment.create({
      data: {
        centerId: centerA.id, studentId: student.id, courseId: courseHostile.id,
        amount: 200_00, status: "paid", receiptNumber: `${tag}-R2`,
        recordedBy: ownerA.id, paidAt: inRange(12),
      },
    });
    await tx.payment.create({
      data: {
        centerId: centerA.id, studentId: student.id, courseId: courseArabic.id,
        amount: 999_00, status: "paid", receiptNumber: `${tag}-R3`,
        recordedBy: ownerA.id, paidAt: OUT_OF_RANGE,
      },
    });
    await tx.expense.create({
      data: {
        centerId: centerA.id, amount: 120_00, category: "rent",
        description: tag + "-rent", recordedBy: ownerA.id, expenseDate: inRange(3),
      },
    });
    await tx.expense.create({
      data: {
        centerId: centerA.id, amount: 30_00, category: "utilities",
        description: tag + "-power", recordedBy: ownerA.id, expenseDate: inRange(8),
      },
    });

    await tx.payment.create({
      data: {
        centerId: centerB.id, studentId: student.id, courseId: courseB.id,
        amount: 777_00, status: "paid", receiptNumber: `${tag}-RB1`,
        recordedBy: ownerB.id, paidAt: inRange(6),
      },
    });

    return {
      centerA: centerA.id, centerB: centerB.id,
      ownerA: ownerA.id, ownerB: ownerB.id,
      teacher: teacher.id, student: student.id,
      courseArabic: courseArabic.id, courseHostile: courseHostile.id, courseB: courseB.id,
      sessions: [session.id, sessionOut.id],
    };
  });

  const A: SessionUser = { id: fx.ownerA, role: "center_admin", centerId: fx.centerA, locale: "ar" } as SessionUser;
  const B: SessionUser = { id: fx.ownerB, role: "center_admin", centerId: fx.centerB, locale: "ar" } as SessionUser;

  const censusBefore = await moneyCensus([fx.centerA, fx.centerB]);

  try {
    console.log("\n[1] The export is the report — not a second read of the same tables");
    const report = await getNetProfitReport(A, FROM, TO);
    const { table: netTable } = await buildReportExport({
      key: "net-profit", user: A, staffRole: null, from: FROM, to: TO,
    });

    ok(report.revenue === 500_00, `the range's revenue is 500.00 EGP (got ${egp(report.revenue)})`);
    ok(report.expenses === 150_00, `the range's expenses are 150.00 EGP (got ${egp(report.expenses)})`);
    ok(
      netTable.totalRow!.revenue === report.revenue &&
        netTable.totalRow!.expenses === report.expenses &&
        netTable.totalRow!.net === report.netProfit,
      "the export's total row IS the report's own three headline figures",
    );
    ok(
      netTable.rows.length === report.monthly.length &&
        netTable.rows.every((r, i) => r.revenue === report.monthly[i]!.revenue && r.expenses === report.monthly[i]!.expenses),
      "and every monthly row is the report's own series, in its order",
    );

    const expenseReport = await getExpensesReport(A, FROM, TO);
    const { table: expTable } = await buildReportExport({
      key: "expenses", user: A, staffRole: null, from: FROM, to: TO,
    });
    ok(
      expTable.totalRow!.amount === expenseReport.total &&
        expTable.rows.length === expenseReport.byCategory.length,
      "the expenses export carries the expense report's own total and categories",
    );

    const attendance = await getAttendanceByCourse(A, FROM, TO);
    const { table: attTable } = await buildReportExport({
      key: "attendance-by-course", user: A, staffRole: null, from: FROM, to: TO,
    });
    ok(
      attTable.rows.length === attendance.items.length &&
        attTable.rows[0]?.present === attendance.items[0]?.present &&
        attTable.rows[0]?.attendanceRatePct === attendance.items[0]?.attendanceRatePct,
      "the attendance export is the attendance report's own rows and rate",
    );

    const fill = await getCourseFillRates(A);
    const { table: fillTable } = await buildReportExport({
      key: "course-fill-rates", user: A, staffRole: null,
    });
    ok(
      fillTable.rows.length === fill.items.length &&
        fillTable.rows.every((r, i) => r.enrolled === fill.items[i]!.enrolled && r.maxStudents === fill.items[i]!.maxStudents),
      "the fill-rate export is the fill-rate report's own rows",
    );

    console.log("\n[2] The range narrows the FILE, not just the total");
    const { table: wideTable } = await buildReportExport({ key: "net-profit", user: A, staffRole: null });
    ok(
      (wideTable.totalRow!.revenue as number) === 1499_00,
      `with no range every receipt counts — 1499.00 EGP (got ${egp(wideTable.totalRow!.revenue as number)})`,
    );
    const rangedCsv = toCsv(netTable, { locale: "en", title: "net" });
    ok(
      !rangedCsv.includes(egp(999_00)),
      "the out-of-range 999.00 receipt appears NOWHERE in the ranged file",
    );

    const { table: attWide } = await buildReportExport({ key: "attendance-by-course", user: A, staffRole: null });
    const attWideRow = attWide.rows.find((r) => r.title === "رياضيات — الصف الثالث");
    ok(
      attTable.rows[0]?.absent === 0 && attWideRow?.absent === 1,
      "the out-of-range absence is counted only when the range is dropped",
    );

    console.log("\n[3] Tenant isolation — an export cannot widen scopedDb");
    const csvA = toCsv(
      (await buildReportExport({ key: "revenue-by-course", user: A, staffRole: null, from: FROM, to: TO })).table,
      { locale: "en" },
    );
    ok(!csvA.includes(egp(777_00)), "center B's 777.00 receipt is absent from center A's revenue file");
    ok(!csvA.includes(tag + "-B-course"), "…and so is the name of B's group");

    const { table: tableB } = await buildReportExport({
      key: "revenue-by-course", user: B, staffRole: null, from: FROM, to: TO,
    });
    ok(
      tableB.totalRow!.revenue === 777_00 && tableB.rows.length === 1,
      `center B's own export shows exactly its own 777.00 (got ${egp(tableB.totalRow!.revenue as number)})`,
    );

    console.log("\n[4] The report's OWN tier — read from the registry, not the route");
    await expectThrows(
      () => buildReportExport({ key: "net-profit", user: A, staffRole: "manager", from: FROM, to: TO }),
      /cannot export this report/i,
      "a MANAGER is refused the profit-and-loss statement",
    );
    await expectThrows(
      () => buildReportExport({ key: "revenue-by-course", user: A, staffRole: "manager" }),
      /cannot export this report/i,
      "…and revenue by group — the money split is the whole point of the tier",
    );
    await expectThrows(
      () => buildReportExport({ key: "attendance-by-course", user: A, staffRole: "center_accountant" }),
      /cannot export this report/i,
      "a center_accountant is refused a MANAGER report (a finance tier, not everything)",
    );
    await expectThrows(
      () => buildReportExport({ key: "net-profit", user: A, staffRole: "receptionist" }),
      /cannot export this report/i,
      "a receptionist is in NO export tier",
    );
    const asAccountant = await buildReportExport({
      key: "net-profit", user: A, staffRole: "center_accountant", from: FROM, to: TO,
    });
    ok(
      asAccountant.table.totalRow!.revenue === report.revenue,
      "the center_accountant exports the money report, and gets the same figures as the owner",
    );
    const asManager = await buildReportExport({
      key: "attendance-by-course", user: A, staffRole: "manager", from: FROM, to: TO,
    });
    ok(asManager.table.rows.length === attendance.items.length, "the manager exports the attendance report");

    let leaked: unknown = "no result";
    try {
      leaked = await buildReportExport({ key: "expenses", user: A, staffRole: "manager" });
    } catch { /* expected */ }
    ok(leaked === "no result", "a refused export returns no table at all — nothing partially loaded");

    await expectThrows(
      () => buildReportExport({ key: "the-whole-drawer" as ReportExportKey, user: A, staffRole: null }),
      /unknown report/i,
      "an unknown report key is refused, never guessed",
    );

    console.log("\n[5] The hostile course title, after a round trip through Postgres");
    const revCsv = toCsv(
      (await buildReportExport({ key: "revenue-by-course", user: A, staffRole: null, from: FROM, to: TO })).table,
      { locale: "ar", title: "الإيرادات" },
    );
    ok(revCsv.includes(HOSTILE_TITLE), "the title stored in the database is preserved verbatim — nothing is dropped");
    ok(
      revCsv.includes(`'${HOSTILE_TITLE}`),
      "…and it is prefixed with an apostrophe, so Excel renders it as text instead of running it",
    );
    ok(
      !csvLines(revCsv).some((l) => l.startsWith("=") || l.startsWith("=\"")),
      "no line in the file begins with a formula lead-in",
    );
    ok(revCsv.startsWith("﻿"), "the file opens with the BOM — without it the Arabic title is mojibake in Excel");
    ok(revCsv.includes("رياضيات — الصف الثالث"), "and the Arabic group name survives intact");

    console.log("\n[6] Every registry entry loads against real data");
    for (const key of Object.keys(REPORT_EXPORTS) as ReportExportKey[]) {
      try {
        const { table, def } = await buildReportExport({ key, user: A, staffRole: null, from: FROM, to: TO });
        const csv = toCsv(table, { locale: "ar", title: def.title.ar });
        const header = tableLines(csv)[0] ?? "";
        ok(
          table.columns.length > 0 && header.split(",").length === table.columns.length,
          `${key}: loads, and its header carries all ${table.columns.length} columns`,
        );
      } catch (e) {
        ok(false, `${key}: loads (threw: ${(e as Error).message.slice(0, 60)})`);
      }
    }
    ok(
      exportFilename("net-profit", new Date().toISOString()).endsWith(".csv"),
      "the filename is the report key plus the date, so a folder of downloads sorts",
    );

    console.log("\n[7] An export is a READ");
    const censusAfter = await moneyCensus([fx.centerA, fx.centerB]);
    ok(censusBefore === censusAfter, "payments, expenses and the ledger are byte-identical after 20+ exports");
    const [auditRows] = await q<{ n: number }>(
      `SELECT count(*)::int n FROM audit_logs WHERE center_id = ANY($1::uuid[])`,
      [[fx.centerA, fx.centerB]],
    );
    ok(auditRows.n === 0, "and no audit row was written — reading a report is not an act on the center");
  } finally {
    const c = await admin.connect();
    try {
      const centers = [fx.centerA, fx.centerB];
      const courses = [fx.courseArabic, fx.courseHostile, fx.courseB];
      const users = [fx.ownerA, fx.ownerB, fx.teacher, fx.student];
      await c.query(`DELETE FROM attendance_records WHERE course_id = ANY($1::uuid[])`, [courses]);
      await c.query(`DELETE FROM sessions WHERE id = ANY($1::uuid[])`, [fx.sessions]);
      await c.query(`DELETE FROM enrollments WHERE course_id = ANY($1::uuid[])`, [courses]);
      await c.query(`DELETE FROM payments WHERE center_id = ANY($1::uuid[])`, [centers]);
      await c.query(`DELETE FROM expenses WHERE center_id = ANY($1::uuid[])`, [centers]);
      await c.query(`DELETE FROM audit_logs WHERE center_id = ANY($1::uuid[])`, [centers]);
      await c.query(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [courses]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [users]);
      await c.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [centers]);
      const left = await c.query(`SELECT count(*)::int n FROM payments WHERE receipt_number LIKE $1`, [tag + "%"]);
      ok(left.rows[0].n === 0, "teardown: every fixture row removed");
    } finally {
      c.release();
      await admin.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite report-export.test.ts" })
  .then(() => main()).catch((e) => { console.error(e); process.exit(1); });
