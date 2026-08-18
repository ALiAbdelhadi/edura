/**
 * Per-lesson ratings — the constraint fix (migration
 * 20260818120000_review_per_lesson_unique).
 *
 * WHAT WAS BROKEN. `reviews.lesson_id` is documented on the column as "for
 * per-lesson ratings (PRD)", but the table carried UNIQUE (student_id,
 * teacher_id). A student could therefore hold exactly ONE review row per
 * teacher for all time, so the second lesson they rated collided with the
 * first. The column was unreachable by construction and nothing ever wrote it.
 *
 * Proves:
 *  - a student can rate TWO different lessons of the SAME teacher (the case
 *    the old constraint made impossible);
 *  - rating the SAME lesson twice is refused by the service (409) AND by the
 *    database when the service is bypassed (reviews_one_per_lesson);
 *  - the standing one-review-per-teacher rule SURVIVES — a second overall
 *    review is still refused, by the service and by the index
 *    (reviews_one_overall_per_teacher), which is the rule the old constraint
 *    got right and a naive 3-column unique would have silently dropped;
 *  - the teacher's headline rating stays ONE VOTE PER STUDENT: per-lesson
 *    ratings do not move ratingCount;
 *  - you may only rate a lesson you were PRESENT at, and only under the
 *    teacher who actually taught it;
 *  - points are awarded for the standing review only, so the new path is not
 *    a points farm (teacher_rating is worth 15).
 *
 * Run (all suites, guarded):  bun run --filter edura test:db
 * Run (this one only):        bun run --filter edura test:db:only review-per-lesson
 * NEVER --env-file=.env.local: that is the DEV database and it skips the guard.
 */
import { withPlatformContext } from "@repo/database";
import { createReview } from "@/lib/services/reviews/reviews";
import type { SessionUser } from "@/lib/auth/session";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "review-per-lesson.test.ts";

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
async function expectThrows(fn: () => Promise<unknown>, label: string) {
  try {
    await fn();
    assert(false, `${label} (did not throw)`);
  } catch (e) {
    assert(true, `${label} (threw: ${(e as Error).message.slice(0, 80)})`);
  }
}

const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function main() {
  const tag = "revlesson-" + rid();
  __sweepTag = tag;
  console.log("Per-lesson review DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const center = await tx.center.create({
      data: {
        name: `${tag}-center`,
        shortId: ("C" + rid() + rid()).slice(0, 12).toUpperCase(),
        status: "active",
        walletBalance: 0,
      },
    });

    const mkTeacher = async (k: string) => {
      const u = await tx.user.create({
        data: { name: `${tag}-${k}`, role: "teacher", email: `${tag}-${k}@x.io`, status: "active" },
      });
      await tx.teacherProfile.create({ data: { userId: u.id } });
      return u.id;
    };
    const teacherId = await mkTeacher("teacher");
    const otherTeacherId = await mkTeacher("other");

    const studentUser = await tx.user.create({
      data: { name: `${tag}-student`, role: "student", email: `${tag}-student@x.io`, status: "active" },
    });
    await tx.studentProfile.create({
      data: {
        userId: studentUser.id,
        fullName: `${tag}-student`,
        familyLinkCode: ("F" + rid() + rid()).slice(0, 12).toUpperCase(),
      },
    });

    const course = await tx.course.create({
      data: {
        centerId: center.id,
        teacherId,
        title: `${tag}-course`,
        subject: "math",
        daysOfWeek: [1],
        startTime: "16:00",
        endTime: "18:00",
        startDate: new Date("2026-01-05T00:00:00Z"),
        price: 100000,
        maxStudents: 30,
        status: "active",
      },
    });

    // Three lessons: two the student attended, one they did not. Plus a lesson
    // belonging to a DIFFERENT teacher, for the wrong-teacher check.
    const mkSession = async (day: number, ownerId: string, courseId: string) =>
      (
        await tx.session.create({
          data: {
            courseId,
            teacherId: ownerId,
            originalDate: new Date(`2026-01-${String(day).padStart(2, "0")}T00:00:00Z`),
            date: new Date(`2026-01-${String(day).padStart(2, "0")}T00:00:00Z`),
            startTime: "16:00",
            endTime: "18:00",
            status: "completed",
          },
        })
      ).id;

    const lessonA = await mkSession(5, teacherId, course.id);
    const lessonB = await mkSession(12, teacherId, course.id);
    const lessonUnattended = await mkSession(19, teacherId, course.id);

    const otherCourse = await tx.course.create({
      data: {
        centerId: center.id,
        teacherId: otherTeacherId,
        title: `${tag}-other-course`,
        subject: "physics",
        daysOfWeek: [2],
        startTime: "16:00",
        endTime: "18:00",
        startDate: new Date("2026-01-06T00:00:00Z"),
        price: 100000,
        maxStudents: 30,
        status: "active",
      },
    });
    const lessonOtherTeacher = await mkSession(6, otherTeacherId, otherCourse.id);

    // Present at A, B and the other teacher's lesson; absent from the third.
    for (const [sid, cid] of [
      [lessonA, course.id],
      [lessonB, course.id],
      [lessonOtherTeacher, otherCourse.id],
    ] as const) {
      await tx.attendanceRecord.create({
        data: {
          sessionId: sid,
          studentId: studentUser.id,
          courseId: cid,
          centerId: center.id,
          status: "present",
          markedBy: teacherId,
        },
      });
    }

    return {
      centerId: center.id,
      teacherId,
      otherTeacherId,
      studentId: studentUser.id,
      lessonA,
      lessonB,
      lessonUnattended,
      lessonOtherTeacher,
    };
  });

  const student: SessionUser = { id: fx.studentId, role: "student" } as SessionUser;

  const pointsRows = () =>
    withPlatformContext((tx) =>
      tx.pointsLedger.count({ where: { studentId: fx.studentId, eventName: "teacher_rating" } }),
    );

  // --- THE CASE THE OLD CONSTRAINT MADE IMPOSSIBLE ---------------------------
  const rA = await createReview(
    { teacherId: fx.teacherId, rating: 5, text: "great lesson", lessonId: fx.lessonA },
    student,
  );
  assert(rA.lessonId === fx.lessonA, "lesson A rating created, lessonId persisted");

  const rB = await createReview(
    { teacherId: fx.teacherId, rating: 3, lessonId: fx.lessonB },
    student,
  );
  assert(
    rB.lessonId === fx.lessonB && rB.id !== rA.id,
    "SAME student rated a SECOND lesson of the SAME teacher (was P2002 before the fix)",
  );

  const afterLessonRatings = await pointsRows();
  assert(afterLessonRatings === 0, "per-lesson ratings award NO points (not a points farm)");

  // --- same lesson twice: service, then the database directly ---------------
  await expectThrows(
    () => createReview({ teacherId: fx.teacherId, rating: 1, lessonId: fx.lessonA }, student),
    "rating the SAME lesson twice is refused by the service",
  );
  await expectThrows(
    () =>
      withPlatformContext((tx) =>
        tx.review.create({
          data: {
            studentId: fx.studentId,
            teacherId: fx.teacherId,
            centerId: fx.centerId,
            lessonId: fx.lessonA,
            rating: 1,
          },
        }),
      ),
    "rating the SAME lesson twice is refused by the DATABASE (reviews_one_per_lesson)",
  );

  // --- eligibility ----------------------------------------------------------
  await expectThrows(
    () =>
      createReview({ teacherId: fx.teacherId, rating: 5, lessonId: fx.lessonUnattended }, student),
    "cannot rate a lesson the student was not PRESENT at",
  );
  await expectThrows(
    () =>
      createReview(
        { teacherId: fx.teacherId, rating: 5, lessonId: fx.lessonOtherTeacher },
        student,
      ),
    "cannot rate a lesson under a teacher who did not teach it",
  );

  // --- the standing review still works, and is still one-per-teacher --------
  const overall = await createReview({ teacherId: fx.teacherId, rating: 4, text: "good" }, student);
  assert(overall.lessonId === null, "overall review created with lessonId NULL");

  await expectThrows(
    () => createReview({ teacherId: fx.teacherId, rating: 2 }, student),
    "a SECOND overall review is refused by the service",
  );
  await expectThrows(
    () =>
      withPlatformContext((tx) =>
        tx.review.create({
          data: {
            studentId: fx.studentId,
            teacherId: fx.teacherId,
            centerId: fx.centerId,
            rating: 2,
          },
        }),
      ),
    "a SECOND overall review is refused by the DATABASE (reviews_one_overall_per_teacher)",
  );

  // --- headline rating counts overall reviews only --------------------------
  const profile = await withPlatformContext((tx) =>
    tx.teacherProfile.findUnique({
      where: { userId: fx.teacherId },
      select: { ratingAvg: true, ratingCount: true },
    }),
  );
  assert(
    profile?.ratingCount === 1,
    `teacher ratingCount counts OVERALL reviews only (got ${profile?.ratingCount})`,
  );
  assert(
    profile?.ratingAvg === 4,
    `teacher ratingAvg is the overall review's 4, not the 5/3 lesson ratings (got ${profile?.ratingAvg})`,
  );

  const afterOverall = await pointsRows();
  assert(afterOverall === 1, `the standing review awarded points exactly once (got ${afterOverall})`);

  // --- all three rows coexist ----------------------------------------------
  const total = await withPlatformContext((tx) =>
    tx.review.count({ where: { studentId: fx.studentId, teacherId: fx.teacherId } }),
  );
  assert(total === 3, `two lesson ratings + one overall review coexist (got ${total})`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}

async function runGuarded() {
  await assertDbEnv(["test"], { intent: `suite ${SUITE_NAME}` });
  try {
    await main();
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (__sweepTag) await sweepTagQuietly(__sweepTag);
  }
  process.exit(process.exitCode ?? 0);
}

runGuarded().catch((e) => {
  console.error(e);
  process.exit(1);
});
