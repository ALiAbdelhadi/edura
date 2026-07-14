import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { withPlatformContext, prisma } from "@repo/database";
import { completeSession } from "@/lib/services/finance/distribution";
import { refundLessonForStudent } from "@/lib/services/finance/refunds";
import { refundsReport } from "@/lib/services/finance/finance-reports";

neonConfig.webSocketConstructor = ws as never;
const adminPool = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("  ✓", msg); }
  else { fail++; console.error("  ✗", msg); }
}
async function expectThrows(fn: () => Promise<unknown>, match: string, msg: string) {
  try { await fn(); assert(false, msg + " (did not throw)"); }
  catch (e) { assert(e instanceof Error && e.message.includes(match), `${msg} (threw: ${e instanceof Error ? e.message : e})`); }
}

async function main() {
  const tag = "refund-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("Refund/reversal DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({ data: { name: tag + "-t", role: "teacher", email: tag + "-t@x.io", status: "active" } });
    await tx.teacherProfile.create({ data: { userId: teacher.id, walletBalance: 0 } });
    const center = await tx.center.create({ data: { name: tag + "-c", shortId: tag.slice(0, 12).toUpperCase(), status: "active", walletBalance: 0 } });
    await tx.centerTeacherAffiliation.create({ data: { centerId: center.id, teacherId: teacher.id, status: "active", centerShare: 5000, expiresAt: new Date("2027-01-01T00:00:00Z") } });
    const course = await tx.course.create({ data: { centerId: center.id, teacherId: teacher.id, title: tag, subject: "Math", daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date("2026-01-01T00:00:00Z"), price: 20000, maxStudents: 30, status: "active" } });
    const su = await tx.user.create({ data: { name: tag + "-s", role: "student", email: tag + "-s@x.io", status: "active" } });
    await tx.studentProfile.create({ data: { userId: su.id, fullName: tag + "-s", familyLinkCode: (tag + "0").slice(0, 18), pointsBalance: 0 } });
    await tx.enrollment.create({ data: { studentId: su.id, courseId: course.id, centerId: center.id, status: "active", enrolledBy: teacher.id } });
    const s1 = await tx.session.create({ data: { courseId: course.id, teacherId: teacher.id, originalDate: new Date("2026-02-02T10:00:00Z"), date: new Date("2026-02-02T10:00:00Z"), startTime: "10:00", endTime: "11:00", status: "scheduled" } });
    await tx.attendanceRecord.create({ data: { sessionId: s1.id, studentId: su.id, courseId: course.id, centerId: center.id, status: "present", markedBy: teacher.id } });
    return { teacher: teacher.id, center: center.id, course: course.id, s1: s1.id, student: su.id };
  });

  try {
    await completeSession(fx.s1, { id: fx.teacher, role: "teacher" } as never);
    const afterDist = await withPlatformContext(async (tx) => ({
      teacher: (await tx.teacherProfile.findUnique({ where: { userId: fx.teacher }, select: { walletBalance: true } }))?.walletBalance,
      center: (await tx.center.findUnique({ where: { id: fx.center }, select: { walletBalance: true } }))?.walletBalance,
    }));
    assert(afterDist.teacher === 14800, `teacher wallet after distribution = 14800 (got ${afterDist.teacher})`);
    assert(afterDist.center === 4800, `center wallet after distribution = 4800 (got ${afterDist.center})`);

    const res = await refundLessonForStudent(fx.s1, fx.student, "duplicate charge", { id: fx.teacher, role: "accountant" } as never);
    assert(res.refunded === 20000, `refund amount = full price 20000 (got ${res.refunded})`);

    const afterRefund = await withPlatformContext(async (tx) => {
      const teacher = (await tx.teacherProfile.findUnique({ where: { userId: fx.teacher }, select: { walletBalance: true } }))?.walletBalance;
      const center = (await tx.center.findUnique({ where: { id: fx.center }, select: { walletBalance: true } }))?.walletBalance;
      const payment = await tx.transaction.findFirst({ where: { lessonId: fx.s1, type: "payment" }, select: { id: true, amount: true } });
      const refund = await tx.transaction.findFirst({ where: { lessonId: fx.s1, type: "refund" }, select: { amount: true, reversalOfId: true, toEntityId: true } });
      const adjustments = await tx.transaction.aggregate({ where: { lessonId: fx.s1, type: "adjustment" }, _sum: { amount: true }, _count: { _all: true } });
      return { teacher, center, payment, refund, adjustments };
    });

    assert(afterRefund.teacher === 0, `teacher wallet back to 0 after refund (got ${afterRefund.teacher})`);
    assert(afterRefund.center === 0, `center wallet back to 0 after refund (got ${afterRefund.center})`);
    assert(afterRefund.refund?.amount === 20000, `refund row = full price (got ${afterRefund.refund?.amount})`);
    assert(afterRefund.refund?.reversalOfId === afterRefund.payment?.id, "refund row reversal_of_id links the original payment");
    assert(afterRefund.refund?.toEntityId === fx.student, "refund is paid to the student");
    assert(afterRefund.adjustments._count._all === 2 && afterRefund.adjustments._sum.amount === 400, `platform fee (400) returned via 2 adjustments (got ${afterRefund.adjustments._count._all} rows / ${afterRefund.adjustments._sum.amount})`);

    const report = await refundsReport();
    assert(report.refunds.some((r: { lessonId: string | null }) => r.lessonId === fx.s1), "refund appears in the refunds report");

    await expectThrows(
      () => refundLessonForStudent(fx.s1, fx.student, "again", { id: fx.teacher, role: "accountant" } as never),
      "already been refunded",
      "second refund of the same charge is rejected",
    );
  } finally {
    const c = await adminPool.connect();
    try {
      await c.query(`DELETE FROM transactions WHERE lesson_id = $1`, [fx.s1]);
      await c.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [[fx.student]]);
      await c.query(`DELETE FROM points_ledger WHERE student_id = $1`, [fx.student]);
      await c.query(`DELETE FROM attendance_records WHERE session_id = $1`, [fx.s1]);
      await c.query(`DELETE FROM sessions WHERE id = $1`, [fx.s1]);
      await c.query(`DELETE FROM enrollments WHERE course_id = $1`, [fx.course]);
      await c.query(`DELETE FROM courses WHERE id = $1`, [fx.course]);
      await c.query(`DELETE FROM center_teacher_affiliations WHERE center_id = $1`, [fx.center]);
      await c.query(`DELETE FROM student_profiles WHERE user_id = $1`, [fx.student]);
      await c.query(`DELETE FROM teacher_profiles WHERE user_id = $1`, [fx.teacher]);
      await c.query(`DELETE FROM audit_logs WHERE actor_id = $1`, [fx.teacher]);
      await c.query(`DELETE FROM centers WHERE id = $1`, [fx.center]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[fx.student, fx.teacher]]);
    } finally {
      c.release();
      await adminPool.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
