/**
 * Live-DB integration checks for the money-safety concurrency fixes (PRD §5.1).
 * Opt-in (`pnpm test:db`) — needs DATABASE_URL. Creates an isolated throwaway
 * center/course/session, exercises the real distribution path, asserts the
 * invariants, then cleans up its own rows. No test framework — plain asserts so
 * it runs under tsx without extra deps.
 */
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { withPlatformContext, prisma } from "@repo/database";
import { completeSession, distributeSessionRevenue } from "@/lib/services/finance/distribution";

// Cleanup deletes ledger rows, which the runtime role (edura_app) is REVOKEd
// from — so tear down as the owner role over a direct admin pool.
neonConfig.webSocketConstructor = ws as never;
const adminPool = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });

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

  // ---- setup: center, teacher, 2 students, course (2 sessions), attendance ----
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
        price: 40000, // 2 planned sessions -> 20000 per session (200 EGP)
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
    // both students present in session 1
    for (const sid of students) {
      await tx.attendanceRecord.create({
        data: { sessionId: s1.id, studentId: sid, courseId: course.id, centerId: center.id, status: "present", markedBy: teacher.id },
      });
    }
    return { teacher: teacher.id, center: center.id, course: course.id, s1: s1.id, s2: s2.id, students };
  });

  try {
    // ---- TEST 1: concurrent completeSession → exactly one distribution ----
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
      const center = await tx.center.findUnique({ where: { id: fx.center }, select: { walletBalance: true } });
      const sess = await tx.session.findUnique({ where: { id: fx.s1 }, select: { distributedAt: true, status: true } });
      return { txns, refCount: refs.size, teacher, center, sess };
    });

    // 2 students × (1 payment + 2 commission) = 6 rows, all unique refs
    assert(after.txns.length === 6, `6 ledger rows for 2 present students (got ${after.txns.length})`);
    assert(after.refCount === 6, `all ref numbers unique (got ${after.refCount} distinct of ${after.txns.length})`);
    assert(after.sess?.distributedAt != null, "session.distributed_at is set");
    assert(after.sess?.status === "completed", "session status = completed");

    // per session: price 20000, share 5000 → teacherNet 14800, centerNet 4800; ×2 students
    assert(after.teacher?.walletBalance === 14800 * 2, `teacher wallet = 29600 (got ${after.teacher?.walletBalance})`);
    assert(after.center?.walletBalance === 4800 * 2, `center wallet = 9600 (got ${after.center?.walletBalance})`);

    // ---- TEST 2: re-running distribution is a no-op (idempotent) ----
    const rerun = await withPlatformContext((tx) => distributeSessionRevenue(tx, fx.s1));
    assert(rerun.distributed === false && rerun.reason === "already_distributed", "re-distribution is a no-op");
    const stillSix = await withPlatformContext((tx) => tx.transaction.count({ where: { lessonId: fx.s1 } }));
    assert(stillSix === 6, `ledger unchanged after re-run (got ${stillSix})`);

    // ---- TEST 3: session with no present students does NOT claim distribution ----
    const empty = await withPlatformContext((tx) => distributeSessionRevenue(tx, fx.s2));
    assert(empty.distributed === false && empty.reason === "no_present_students", "no-attendance session not distributed");
    const s2after = await withPlatformContext((tx) => tx.session.findUnique({ where: { id: fx.s2 }, select: { distributedAt: true } }));
    assert(s2after?.distributedAt == null, "no-attendance session left un-claimed (can distribute later)");
  } finally {
    // ---- cleanup (owner role; edura_app is REVOKEd from ledger deletes) ----
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
