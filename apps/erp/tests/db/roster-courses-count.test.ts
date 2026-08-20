// Proof — the center roster's "courses" column is REAL, and it counts the one
// thing its header names.
//
// The bug: `listRosterStudents` never set `coursesCount`, so
// admin-students-screen.tsx rendered `r.coursesCount || 0` — a hardcoded 0 for
// every student, on a screen a center uses to see who is taking what.
//
// The architecture decision this suite pins down: an Enrollment is the ROSTER
// LINK and a Subscription is the PAYMENT COVERAGE wrapping it. This is the
// roster screen, so the column counts ACTIVE ENROLLMENTS AT THIS CENTER. The
// suite asserts that boundary from both sides — a paid subscription with no
// active enrollment does NOT raise the number, and an active enrollment with no
// subscription DOES.
import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext, prisma } from "@repo/database";
import { listRosterStudents } from "@repo/server-core/services/center/roster";
import type { SessionUser } from "@/lib/auth/session";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗", m)); };

const centerActor = (centerId: string): SessionUser =>
  ({ id: "irrelevant-" + centerId, role: "center_admin", centerId, locale: "en" });

const courseData = (tag: string, n: string, teacherId: string, centerId: string | null) => ({
  centerId, teacherId, title: `${tag}-${n}`, subject: "Math",
  daysOfWeek: [1], startTime: "10:00", endTime: "11:00",
  startDate: new Date("2026-01-01T00:00:00Z"),
  maxStudents: 30, status: "active" as const, price: 40000,
});

async function main() {
  const tag = "rcc-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("Roster coursesCount —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const centerA = await tx.center.create({ data: { name: tag + "-A", shortId: (tag + "A").slice(0, 12).toUpperCase(), status: "active", walletBalance: 0 } });
    const centerB = await tx.center.create({ data: { name: tag + "-B", shortId: (tag + "B").slice(0, 12).toUpperCase(), status: "active", walletBalance: 0 } });
    const teacher = await tx.user.create({ data: { name: tag + "-T", role: "teacher", email: tag + "-t@x.io", status: "active" } });

    const a1 = await tx.course.create({ data: courseData(tag, "a1", teacher.id, centerA.id) });
    const a2 = await tx.course.create({ data: courseData(tag, "a2", teacher.id, centerA.id) });
    const bOnly = await tx.course.create({ data: courseData(tag, "b", teacher.id, centerB.id) });
    // Teacher-direct: centerId NULL. A's roster must never fold it in.
    const direct = await tx.course.create({ data: courseData(tag, "direct", teacher.id, null) });

    const mkStudent = async (n: string) =>
      (await tx.user.create({ data: { name: `${tag}-${n}`, role: "student", email: `${tag}-${n}@x.io`, status: "active" } })).id;

    const s1 = await mkStudent("s1"); // two distinct active courses at A  -> 2
    const s2 = await mkStudent("s2"); // left a1 and rejoined it, + dropped a2   -> 1
    const s3 = await mkStudent("s3"); // rostered, no enrollments at all   -> 0
    const s4 = await mkStudent("s4"); // only teacher-direct + center B    -> 0 at A
    const s5 = await mkStudent("s5"); // PAID subscription, no enrollment  -> 0

    for (const id of [s1, s2, s3, s4, s5]) {
      await tx.centerStudentRoster.create({ data: { centerId: centerA.id, studentId: id, addedAt: new Date() } });
    }

    const enroll = (studentId: string, courseId: string, centerId: string | null, status: "active" | "unenrolled") =>
      tx.enrollment.create({ data: { studentId, courseId, centerId, status, enrolledBy: teacher.id } });

    await enroll(s1, a1.id, centerA.id, "active");
    await enroll(s1, a2.id, centerA.id, "active");

    // s2 left a1 and rejoined it: TWO rows for ONE course, one of them dropped.
    // The count is per COURSE, not per row. (Two *active* rows for a pair are
    // impossible — partial unique `enrollments_active_student_course`.)
    await enroll(s2, a1.id, centerA.id, "unenrolled");
    await enroll(s2, a1.id, centerA.id, "active");
    await enroll(s2, a2.id, centerA.id, "unenrolled"); // left for good -> not counted

    await enroll(s4, direct.id, null, "active");
    await enroll(s4, bOnly.id, centerB.id, "active");

    // s5 pays but is not on any course roster: coverage without a roster link.
    const sub = await tx.subscription.create({
      data: {
        studentId: s5, courseId: a1.id, centerId: centerA.id, teacherId: teacher.id,
        targetType: "center", plan: "monthly", status: "active", source: "walk_in", price: 40000,
        periodStart: new Date("2026-01-01T00:00:00Z"), periodEnd: new Date("2026-12-01T00:00:00Z"),
        paymentMethod: "cash", activatedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });

    return {
      centerA: centerA.id, centerB: centerB.id, teacher: teacher.id, sub: sub.id,
      courses: [a1.id, a2.id, bOnly.id, direct.id],
      students: { s1, s2, s3, s4, s5 },
      a1: a1.id,
    };
  });

  try {
    const rows = await listRosterStudents(centerActor(fx.centerA));
    const byId = new Map(rows.map((r) => [r.studentId, r]));
    const count = (id: string) => byId.get(id)?.coursesCount;

    console.log("\n(1) the column is populated at all — the actual bug:");
    ok(rows.length === 5, `center A lists its 5 rostered students (got ${rows.length})`);
    ok(rows.every((r) => typeof r.coursesCount === "number"), "every row carries a numeric coursesCount (never undefined)");
    ok(rows.some((r) => (r.coursesCount ?? 0) > 0), "at least one row is non-zero (the old code was 0 for all)");

    console.log("\n(2) it counts DISTINCT active courses at this center:");
    ok(count(fx.students.s1) === 2, `s1 in two courses -> 2 (got ${count(fx.students.s1)})`);
    ok(count(fx.students.s2) === 1, `s2 rejoined one course (2 rows) + dropped another -> 1 (got ${count(fx.students.s2)})`);
    ok(count(fx.students.s3) === 0, `s3 with no enrollments -> 0 (got ${count(fx.students.s3)})`);

    console.log("\n(3) scope: another center's and teacher-direct courses are NOT this center's:");
    ok(count(fx.students.s4) === 0, `s4 (teacher-direct + center B only) -> 0 at A (got ${count(fx.students.s4)})`);
    const bRows = await listRosterStudents(centerActor(fx.centerB));
    ok(bRows.length === 0, `center B rosters nobody, so it lists nobody (got ${bRows.length})`);

    console.log("\n(4) enrollment, NOT subscription — the header says courses:");
    ok(count(fx.students.s5) === 0, `s5 has an ACTIVE PAID subscription but no enrollment -> 0 (got ${count(fx.students.s5)})`);
    ok(count(fx.students.s1) === 2, "s1 has enrollments and NO subscription -> still counted");

    console.log("\n(5) filtering the rows does not narrow the counts:");
    const filtered = await listRosterStudents(centerActor(fx.centerA), { courseId: fx.a1 });
    const fById = new Map(filtered.map((r) => [r.studentId, r]));
    ok(fById.has(fx.students.s1) && fById.has(fx.students.s2), "?courseId= still returns the students in that course");
    ok(!fById.has(fx.students.s3), "?courseId= excludes a student not in it");
    ok(fById.get(fx.students.s1)?.coursesCount === 2, `s1 still reads its full 2 under a courseId filter (got ${fById.get(fx.students.s1)?.coursesCount})`);
  } finally {
    const c = await admin.connect();
    const studentIds = Object.values(fx.students);
    try {
      await c.query(`DELETE FROM subscriptions WHERE id = $1`, [fx.sub]);
      await c.query(`DELETE FROM enrollments WHERE course_id = ANY($1::uuid[])`, [fx.courses]);
      await c.query(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [fx.courses]);
      await c.query(`DELETE FROM center_student_rosters WHERE student_id = ANY($1::uuid[])`, [studentIds]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[...studentIds, fx.teacher]]);
      await c.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [[fx.centerA, fx.centerB]]);
    } finally {
      c.release();
      await admin.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

// The environment guard runs BEFORE main(), so invoking this file directly
// (which bypasses the `pretest:db` step) cannot write to dev or production.
assertDbEnv(["test"], { intent: "suite roster-courses-count.test.ts" })
  .then(() => main()).catch((e) => { console.error(e); process.exit(1); });
