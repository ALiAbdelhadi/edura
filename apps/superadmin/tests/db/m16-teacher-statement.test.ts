import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext, prisma } from "@repo/database";
import { teacherStatement, centerStatement } from "@/lib/services/finance/finance-reports";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const adminPool = testPool();

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("  ✓", msg); }
  else { fail++; console.error("  ✗", msg); }
}

async function main() {
  const tag = "m16ts-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("M-16 teacherStatement DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({ data: { name: tag + "-t", role: "teacher", email: tag + "-t@x.io", status: "active" } });
    await tx.teacherProfile.create({ data: { userId: teacher.id, walletBalance: 0 } });
    const other = await tx.user.create({ data: { name: tag + "-o", role: "teacher", email: tag + "-o@x.io", status: "active" } });
    await tx.teacherProfile.create({ data: { userId: other.id, walletBalance: 0 } });
    const center = await tx.center.create({ data: { name: tag + "-c", shortId: tag.slice(0, 12).toUpperCase(), status: "active", walletBalance: 0 } });
    const course = await tx.course.create({ data: { centerId: center.id, teacherId: teacher.id, title: tag, subject: "Math", daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date("2026-01-01T00:00:00Z"), price: 20000, maxStudents: 30, status: "active" } });
    const mkSession = (teacherId: string, day: string) =>
      tx.session.create({ data: { courseId: course.id, teacherId, originalDate: new Date(day), date: new Date(day), startTime: "10:00", endTime: "11:00", status: "completed" } });
    const s1 = await mkSession(teacher.id, "2026-02-02T10:00:00Z");
    const s2 = await mkSession(teacher.id, "2026-05-02T10:00:00Z");
    const s3 = await mkSession(other.id, "2026-02-02T10:00:00Z");
    const mkTx = (n: number, type: "payment" | "commission", lessonId: string, amount: number, createdAt: string) =>
      tx.transaction.create({ data: { refNumber: `${tag}-${n}`, type, amount, lessonId, status: "completed", createdAt: new Date(createdAt) } });
    await mkTx(1, "payment", s1.id, 10000, "2026-02-02T12:00:00Z");
    await mkTx(2, "payment", s2.id, 7000, "2026-05-02T12:00:00Z");
    await mkTx(3, "commission", s1.id, 400, "2026-02-02T12:00:00Z");
    await mkTx(4, "payment", s3.id, 9999, "2026-02-02T12:00:00Z");
    return { teacher: teacher.id, other: other.id, center: center.id, course: course.id, sessions: [s1.id, s2.id, s3.id] };
  });

  try {
    const full = await teacherStatement(fx.teacher);
    assert(full.grossLessonRevenue === 17000,
      `full-range gross sums only this teacher's payment rows (got ${full.grossLessonRevenue}, want 17000 — excludes the other teacher's 9999 and the commission 400)`);

    const windowed = await teacherStatement(fx.teacher, "2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z");
    assert(windowed.grossLessonRevenue === 10000,
      `date-windowed gross keeps only in-range payments (got ${windowed.grossLessonRevenue}, want 10000)`);

    const fromOnly = await teacherStatement(fx.teacher, "2026-03-01T00:00:00Z");
    assert(fromOnly.grossLessonRevenue === 7000,
      `open-ended from filters correctly (got ${fromOnly.grossLessonRevenue}, want 7000)`);

    const legacy = await withPlatformContext(async (tx) => {
      const sessions = await tx.session.findMany({ where: { teacherId: fx.teacher }, select: { id: true } });
      const ids = sessions.map((s) => s.id);
      const agg = await tx.transaction.aggregate({ where: { lessonId: { in: ids }, type: "payment" }, _sum: { amount: true } });
      return agg._sum.amount ?? 0;
    });
    assert(full.grossLessonRevenue === legacy,
      `JOIN aggregate equals the legacy session-ids-IN derivation (${full.grossLessonRevenue} vs ${legacy})`);

    const empty = await withPlatformContext(async (tx) => {
      const u = await tx.user.create({ data: { name: tag + "-e", role: "teacher", email: tag + "-e@x.io", status: "active" } });
      return u.id;
    });
    const none = await teacherStatement(empty);
    assert(none.grossLessonRevenue === 0, `teacher with zero sessions reports 0 gross (got ${none.grossLessonRevenue})`);
    await withPlatformContext(async (tx) => { await tx.user.delete({ where: { id: empty } }); });

    // A statement that aggregates type:"payment" only overstates gross by the
    // whole refunded total, which is a second set of books against the refunds
    // report reading the same rows (REFUND_DECISION.md §1.4).
    await withPlatformContext(async (tx) => {
      await tx.transaction.create({ data: { refNumber: `${tag}-5`, type: "refund", amount: 3000, lessonId: fx.sessions[0], status: "completed", createdAt: new Date("2026-02-03T12:00:00Z") } });
      await tx.transaction.create({ data: { refNumber: `${tag}-6`, type: "payment", amount: 8000, centerId: fx.center, status: "completed", createdAt: new Date("2026-02-02T12:00:00Z") } });
      await tx.transaction.create({ data: { refNumber: `${tag}-7`, type: "refund", amount: 2000, centerId: fx.center, status: "completed", createdAt: new Date("2026-02-03T12:00:00Z") } });
    });

    const refunded = await teacherStatement(fx.teacher);
    assert(refunded.grossLessonRevenue === 14000,
      `teacher gross is NET of refunds (got ${refunded.grossLessonRevenue}, want 17000 − 3000 = 14000)`);

    const outOfWindow = await teacherStatement(fx.teacher, "2026-03-01T00:00:00Z");
    assert(outOfWindow.grossLessonRevenue === 7000,
      `a refund outside the window still does not touch it (got ${outOfWindow.grossLessonRevenue}, want 7000)`);

    const cs = await centerStatement(fx.center);
    assert(cs.grossLessonRevenue === 6000,
      `centre gross is NET of refunds too (got ${cs.grossLessonRevenue}, want 8000 − 2000 = 6000)`);
  } finally {
    const c = await adminPool.connect();
    try {
      await c.query(`DELETE FROM transactions WHERE ref_number LIKE $1`, [tag + "-%"]);
      await c.query(`DELETE FROM sessions WHERE id = ANY($1::uuid[])`, [fx.sessions]);
      await c.query(`DELETE FROM courses WHERE id = $1`, [fx.course]);
      await c.query(`DELETE FROM centers WHERE id = $1`, [fx.center]);
      await c.query(`DELETE FROM teacher_profiles WHERE user_id = ANY($1::uuid[])`, [[fx.teacher, fx.other]]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[fx.teacher, fx.other]]);
    } finally {
      c.release();
      await adminPool.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite m16-teacher-statement.test.ts" })
  .then(() => main()).catch((e) => { console.error(e); process.exit(1); });
