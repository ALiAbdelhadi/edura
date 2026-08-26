import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext, prisma } from "@repo/database";
import { completeSession, distributeSessionRevenue } from "@/lib/services/finance/distribution";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const adminPool = testPool();

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log("  ✓", msg);
  } else {
    fail++;
    console.error("  ✗", msg);
  }
}

async function main() {
  const tag = "dbtest-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("Money-safety DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({
      data: { name: tag + "-teacher", role: "teacher", email: tag + "-t@x.io", status: "active" },
    });
    await tx.teacherProfile.create({ data: { userId: teacher.id, walletBalance: 0 } });
    const center = await tx.center.create({
      data: { name: tag + "-center", shortId: tag.slice(0, 12).toUpperCase(), status: "active", walletBalance: 0 },
    });
    await tx.centerTeacherAffiliation.create({
      data: {
        centerId: center.id, teacherId: teacher.id, status: "active", centerShare: 5000,
        expiresAt: new Date("2027-01-01T00:00:00Z"),
      },
    });
    const course = await tx.course.create({
      data: {
        centerId: center.id, teacherId: teacher.id, title: tag, subject: "Math",
        daysOfWeek: [1], startTime: "10:00", endTime: "11:00",
        startDate: new Date("2026-01-01T00:00:00Z"),
        price: 40000,
        maxStudents: 30, status: "active",
      },
    });
    const students = [];
    for (let i = 0; i < 2; i++) {
      const su = await tx.user.create({
        data: { name: `${tag}-s${i}`, role: "student", email: `${tag}-s${i}@x.io`, status: "active" },
      });
      await tx.studentProfile.create({
        data: { userId: su.id, fullName: `${tag}-s${i}`, familyLinkCode: `${tag}${i}`.slice(0, 18), pointsBalance: 0 },
      });
      await tx.enrollment.create({
        data: { studentId: su.id, courseId: course.id, centerId: center.id, status: "active", enrolledBy: teacher.id },
      });
      students.push(su.id);
    }
    const mkSession = (d: string) => tx.session.create({
      data: {
        courseId: course.id, teacherId: teacher.id,
        originalDate: new Date(d), date: new Date(d), startTime: "10:00", endTime: "11:00", status: "scheduled",
      },
    });
    const s1 = await mkSession("2026-02-02T10:00:00Z");
    const s2 = await mkSession("2026-02-09T10:00:00Z");
    for (const sid of students) {
      await tx.attendanceRecord.create({
        data: { sessionId: s1.id, studentId: sid, courseId: course.id, centerId: center.id, status: "present", markedBy: teacher.id },
      });
    }
    return { teacher: teacher.id, center: center.id, course: course.id, s1: s1.id, s2: s2.id, students };
  });

  try {
    const results = await Promise.allSettled([
      completeSession(fx.s1, { id: fx.teacher, role: "teacher" } as never),
      completeSession(fx.s1, { id: fx.teacher, role: "teacher" } as never),
    ]);
    const distributed = results.filter(
      (r) => r.status === "fulfilled" && (r.value as { distribution: { distributed: boolean } }).distribution.distributed,
    );
    assert(distributed.length === 1, `exactly ONE of two concurrent completes distributed (got ${distributed.length})`);

    const after = await withPlatformContext(async (tx) => {
      const txns = await tx.transaction.findMany({ where: { lessonId: fx.s1 } });
      const refs = new Set(txns.map((t) => t.refNumber));
      const teacher = await tx.teacherProfile.findUnique({ where: { userId: fx.teacher }, select: { walletBalance: true } });
      const center = await tx.center.findUnique({ where: { id: fx.center }, select: { walletBalance: true, creditBalance: true } });
      const sess = await tx.session.findUnique({ where: { id: fx.s1 }, select: { distributedAt: true, status: true } });
      return { txns, refCount: refs.size, teacher, center, sess };
    });

    assert(after.txns.length === 6, `6 ledger rows for 2 present students (got ${after.txns.length})`);
    assert(after.refCount === 6, `all ref numbers unique (got ${after.refCount} distinct of ${after.txns.length})`);
    assert(after.sess?.distributedAt != null, "session.distributed_at is set");
    assert(after.sess?.status === "completed", "session status = completed");

    assert(after.teacher?.walletBalance === 14800 * 2, `teacher wallet = 29600 (got ${after.teacher?.walletBalance})`);
    // D5 (Phase 4): these students have NO subscription, so the lesson is
    // CENTER-HELD — the center's net (4800/student) stays in its own drawer,
    // wallet_balance is never credited, and its credit POSITION is debited
    // the teacher's net + the platform fees (14800 + 400 per student).
    assert(after.center?.walletBalance === 0, `center wallet NOT credited, center-held (got ${after.center?.walletBalance})`);
    assert(
      after.center?.creditBalance === -(14800 + 400) * 2,
      `center credit debited teacher+fees ×2 = -30400 (got ${after.center?.creditBalance})`,
    );

    const rerun = await withPlatformContext((tx) => distributeSessionRevenue(tx, fx.s1));
    assert(rerun.distributed === false && rerun.reason === "already_distributed", "re-distribution is a no-op");
    const stillSix = await withPlatformContext((tx) => tx.transaction.count({ where: { lessonId: fx.s1 } }));
    assert(stillSix === 6, `ledger unchanged after re-run (got ${stillSix})`);

    const empty = await withPlatformContext((tx) => distributeSessionRevenue(tx, fx.s2));
    assert(empty.distributed === false && empty.reason === "no_present_students", "no-attendance session not distributed");
    const s2after = await withPlatformContext((tx) => tx.session.findUnique({ where: { id: fx.s2 }, select: { distributedAt: true } }));
    assert(s2after?.distributedAt == null, "no-attendance session left un-claimed (can distribute later)");
  } finally {
    const c = await adminPool.connect();
    try {
      await c.query(`DELETE FROM transactions WHERE lesson_id = ANY($1::uuid[])`, [[fx.s1, fx.s2]]);
      await c.query(`DELETE FROM points_ledger WHERE student_id = ANY($1::uuid[])`, [fx.students]);
      await c.query(`DELETE FROM attendance_records WHERE session_id = ANY($1::uuid[])`, [[fx.s1, fx.s2]]);
      await c.query(`DELETE FROM sessions WHERE id = ANY($1::uuid[])`, [[fx.s1, fx.s2]]);
      await c.query(`DELETE FROM enrollments WHERE course_id = $1`, [fx.course]);
      await c.query(`DELETE FROM courses WHERE id = $1`, [fx.course]);
      await c.query(`DELETE FROM center_teacher_affiliations WHERE center_id = $1`, [fx.center]);
      await c.query(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [fx.students]);
      await c.query(`DELETE FROM teacher_profiles WHERE user_id = $1`, [fx.teacher]);
      await c.query(`DELETE FROM audit_logs WHERE actor_id = $1`, [fx.teacher]);
      await c.query(`DELETE FROM center_wallet_ledger WHERE center_id = $1`, [fx.center]);
      await c.query(`DELETE FROM centers WHERE id = $1`, [fx.center]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[...fx.students, fx.teacher]]);
    } finally {
      c.release();
      await adminPool.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

// The environment guard runs BEFORE main(), so invoking this file directly
// (which bypasses the `pretest:db` step) cannot write to dev or production.
assertDbEnv(["test"], { intent: "suite run-db-tests.ts" })
  .then(() => main()).catch((e) => {
  console.error(e);
  process.exit(1);
});
