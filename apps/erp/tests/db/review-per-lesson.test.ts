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
