// H3 proof — two concurrent refunds of the SAME charge must NOT both land.
// Builds a real distributed lesson, fires refundLessonForStudent twice in
// parallel, and asserts exactly one refund row + one clawback (no double).
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { withPlatformContext } from "@repo/database";
import { completeSession } from "@/lib/services/finance/distribution";
import { refundLessonForStudent } from "@/lib/services/finance/refunds";

neonConfig.webSocketConstructor = ws as never;
const admin = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗", m)); };

async function main() {
  const tag = "h3-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("H3 concurrent double-refund —", tag);

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

  await completeSession(fx.s1, { id: fx.teacher, role: "teacher" } as never);

  const dist = await withPlatformContext(async (tx) => ({
    teacher: (await tx.teacherProfile.findUnique({ where: { userId: fx.teacher }, select: { walletBalance: true } }))?.walletBalance,
    center: (await tx.center.findUnique({ where: { id: fx.center }, select: { walletBalance: true } }))?.walletBalance,
  }));
  console.log(`after distribution: teacher=${dist.teacher}, center=${dist.center}`);

  // Fire TWO refunds of the same charge concurrently.
  const accountant = { id: fx.teacher, role: "accountant" } as never;
  const results = await Promise.allSettled([
    refundLessonForStudent(fx.s1, fx.student, "duplicate charge", accountant),
    refundLessonForStudent(fx.s1, fx.student, "duplicate charge", accountant),
  ]);
  const fulfilled = results.filter((r) => r.status === "fulfilled").length;
  const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  console.log(`\nconcurrent refunds → fulfilled: ${fulfilled}, rejected: ${rejected.length}`);
  if (rejected[0]) console.log(`  loser rejected with: "${(rejected[0].reason as Error)?.message}"`);

  const after = await withPlatformContext(async (tx) => ({
    teacher: (await tx.teacherProfile.findUnique({ where: { userId: fx.teacher }, select: { walletBalance: true } }))?.walletBalance,
    center: (await tx.center.findUnique({ where: { id: fx.center }, select: { walletBalance: true } }))?.walletBalance,
    refunds: await tx.transaction.count({ where: { lessonId: fx.s1, type: "refund" } }),
    adjustments: await tx.transaction.count({ where: { lessonId: fx.s1, type: "adjustment" } }),
  }));

  console.log(`\n(assertions)`);
  ok(fulfilled === 1 && rejected.length === 1, "exactly one refund succeeded, one rejected");
  ok((rejected[0]?.reason as Error)?.message?.includes("already been refunded"), "loser said 'already been refunded'");
  ok(after.refunds === 1, `exactly ONE refund transaction row (got ${after.refunds})`);
  ok(after.adjustments === 2, `exactly TWO fee-return adjustments — not doubled (got ${after.adjustments})`);
  ok(after.teacher === 0, `teacher wallet clawed back once: 14800 -> 0 (got ${after.teacher})`);
  ok(after.center === 0, `center wallet clawed back once: 4800 -> 0, never negative (got ${after.center})`);

  // Cleanup deletable fixture rows (append-only transactions remain — Step 9 wipe).
  await admin.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [[fx.student, fx.teacher]]);
  await admin.query(`DELETE FROM attendance_records WHERE session_id=$1`, [fx.s1]);
  await admin.query(`DELETE FROM enrollments WHERE course_id=$1`, [fx.course]);
  await admin.query(`DELETE FROM sessions WHERE id=$1`, [fx.s1]);
  await admin.query(`DELETE FROM center_teacher_affiliations WHERE center_id=$1`, [fx.center]);
  await admin.query(`DELETE FROM courses WHERE id=$1`, [fx.course]);
  await admin.query(`DELETE FROM student_profiles WHERE user_id=$1`, [fx.student]);
  await admin.query(`DELETE FROM teacher_profiles WHERE user_id=$1`, [fx.teacher]);
  await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[fx.student, fx.teacher]]);
  await admin.query(`DELETE FROM centers WHERE id=$1`, [fx.center]);
  await admin.end();

  console.log(`\n${fail === 0 ? "H3 PROOF PASS ✔" : "H3 PROOF FAIL ✗"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
