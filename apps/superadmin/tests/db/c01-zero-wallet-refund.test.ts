import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext, prisma } from "@repo/database";
import { completeSession } from "@/lib/services/finance/distribution";
import { refundLessonForStudent } from "@/lib/services/finance/refunds";
import { computeNoRoomLessonSplit } from "@repo/server-core/services/finance/fees";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const adminPool = testPool();

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("  ✓", msg); }
  else { fail++; console.error("  ✗", msg); }
}

const PRICE = 20000;

async function main() {
  const tag = "c01p7-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("C-01 P7 — zero-wallet refund reversal —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({ data: { name: tag + "-t", role: "teacher", email: tag + "-t@x.io", status: "active" } });
    await tx.teacherProfile.create({ data: { userId: teacher.id, walletBalance: 0 } });
    const center = await tx.center.create({ data: { name: tag + "-c", shortId: tag.slice(0, 12).toUpperCase(), status: "active", walletBalance: 0 } });
    await tx.centerTeacherAffiliation.create({ data: { centerId: center.id, teacherId: teacher.id, status: "active", expiresAt: new Date("2027-01-01T00:00:00Z") } });
    const course = await tx.course.create({ data: { centerId: center.id, teacherId: teacher.id, title: tag, subject: "Math", daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date("2026-01-01T00:00:00Z"), price: PRICE, maxStudents: 30, status: "active" } });
    const su = await tx.user.create({ data: { name: tag + "-s", role: "student", email: tag + "-s@x.io", status: "active" } });
    await tx.studentProfile.create({ data: { userId: su.id, fullName: tag + "-s", familyLinkCode: (tag + "0").slice(0, 18), pointsBalance: 0 } });
    await tx.enrollment.create({ data: { studentId: su.id, courseId: course.id, centerId: center.id, status: "active", enrolledBy: teacher.id } });
    const s1 = await tx.session.create({ data: { courseId: course.id, teacherId: teacher.id, originalDate: new Date("2026-02-02T10:00:00Z"), date: new Date("2026-02-02T10:00:00Z"), startTime: "10:00", endTime: "11:00", status: "scheduled" } });
    await tx.attendanceRecord.create({ data: { sessionId: s1.id, studentId: su.id, courseId: course.id, centerId: center.id, status: "present", markedBy: teacher.id } });
    return { teacher: teacher.id, center: center.id, course: course.id, s1: s1.id, student: su.id };
  });

  const walletsNow = () => withPlatformContext(async (tx) => ({
    t: (await tx.teacherProfile.findUnique({ where: { userId: fx.teacher }, select: { walletBalance: true } }))?.walletBalance ?? 0,
    c: (await tx.center.findUnique({ where: { id: fx.center }, select: { walletBalance: true } }))?.walletBalance ?? 0,
  }));

  try {
    const fees = (await adminPool.query(
      `select platform_teacher_fee::int tf, platform_center_fee::int cf from commission_settings where scope='global'`,
    )).rows[0] as { tf: number; cf: number };

    const before = await walletsNow();
    assert(before.t === 0 && before.c === 0, `both wallets start at zero (teacher ${before.t}, center ${before.c})`);

    await completeSession(fx.s1, { id: fx.teacher, role: "teacher" } as never);
    const settled = await walletsNow();

    const expected = computeNoRoomLessonSplit(PRICE, 0, { platformTeacherFee: fees.tf, platformCenterFee: fees.cf });
    const teacherNet = PRICE - expected.fees.platformTeacherFee - expected.centerShare;
    const centerNet = expected.centerShare - expected.fees.platformCenterFee;
    assert(settled.t === teacherNet, `the zero-wallet lesson settled the teacher by exactly teacherNet (${settled.t} == ${teacherNet})`);
    assert(settled.c === centerNet, `... and the center by exactly centerNet (${settled.c} == ${centerNet})`);

    await refundLessonForStudent(fx.s1, fx.student, `${tag} proof`, { id: fx.teacher, role: "accountant" } as never);
    const reversed = await walletsNow();
    assert(reversed.t === settled.t - teacherNet, `the teacher wallet reversed by exactly teacherNet (${settled.t} -> ${reversed.t})`);
    assert(reversed.c === settled.c - centerNet, `the center wallet reversed by exactly centerNet (${settled.c} -> ${reversed.c})`);
    assert(reversed.t >= 0 && reversed.c >= 0, "both wallets are still >= 0 after the reversal — the H2 floor held");

    let refusedWith = "";
    try {
      await refundLessonForStudent(fx.s1, fx.student, `${tag} double`, { id: fx.teacher, role: "accountant" } as never);
    } catch (e) {
      refusedWith = e instanceof Error ? e.message : String(e);
    }
    assert(refusedWith !== "", `H3: the second refund of the same charge is REFUSED (${refusedWith || "it was NOT refused"})`);

    const refundRows = (await adminPool.query(
      `select count(*)::int c from transactions where type='refund' and lesson_id=$1`, [fx.s1],
    )).rows[0].c as number;
    assert(refundRows === 1, `exactly one refund row exists for this charge (${refundRows})`);

    let floorHeld = false;
    try {
      await adminPool.query(`update centers set wallet_balance = -1 where id=$1`, [fx.center]);
    } catch (e) {
      floorHeld = /wallet_balance_nonneg/.test((e as Error).message);
    }
    assert(floorHeld, "a direct attempt to drive this center's wallet to -1 is STILL rejected by the DB");
  } finally {
    const c = await adminPool.connect();
    try {
      await c.query(`DELETE FROM transactions WHERE lesson_id = $1`, [fx.s1]);
      await c.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [[fx.student, fx.teacher]]);
      await c.query(`DELETE FROM points_ledger WHERE student_id = $1`, [fx.student]);
      await c.query(`DELETE FROM session_settlements WHERE course_id = $1`, [fx.course]);
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

assertDbEnv(["test"], { intent: "suite c01-zero-wallet-refund.test.ts" })
  .then(() => main()).catch((e) => { console.error(e); process.exit(1); });
