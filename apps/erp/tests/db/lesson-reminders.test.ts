import { withPlatformContext } from "@repo/database";
import { runLessonReminders } from "@repo/server-core/services/cron/jobs";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "lesson-reminders.test.ts";

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

const rid = () => Math.floor(Math.random() * 1e9).toString(36);
const HOUR = 3600_000;

// Winter date: Cairo is UTC+2 with no DST ambiguity. 07:00Z = 09:00 Cairo.
const TICK = new Date("2030-01-15T07:00:00Z");
const LATE_TICK = new Date("2030-01-15T21:00:00Z");

async function main() {
  const tag = "lsnr-" + rid();
  __sweepTag = tag;
  console.log("Lesson-reminders DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({
      data: { name: `${tag}-teacher`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
    const student = await tx.user.create({
      data: { name: `${tag}-student`, role: "student", email: `${tag}-s@x.io`, status: "active" },
    });
    const course = await tx.course.create({
      data: {
        centerId: null, teacherId: teacher.id, title: `${tag}-course`, subject: "Math",
        daysOfWeek: [2], startTime: "10:30", endTime: "11:30", startDate: new Date("2030-01-01T00:00:00Z"),
        maxStudents: 30, status: "active", price: 30000, pricePerMonth: 30000,
      },
    });
    await tx.enrollment.create({
      data: { studentId: student.id, courseId: course.id, status: "active", enrolledBy: teacher.id },
    });
    const mk = (day: string, startTime: string) =>
      tx.session.create({
        data: {
          courseId: course.id, teacherId: teacher.id,
          originalDate: new Date(`${day}T00:00:00Z`), date: new Date(`${day}T00:00:00Z`),
          startTime, endTime: "23:59", status: "scheduled",
        },
        select: { id: true },
      });
    return {
      student: student.id,
      soon: (await mk("2030-01-15", "10:30")).id,
      past: (await mk("2030-01-15", "07:30")).id,
      far: (await mk("2030-01-15", "12:00")).id,
      overnight: (await mk("2030-01-16", "00:30")).id,
    };
  });

  const rowsFor = (sessionId: string) =>
    withPlatformContext((tx) =>
      tx.notification.findMany({
        where: { type: "lesson_reminder", data: { path: ["sessionId"], equals: sessionId } },
        select: { userId: true },
      }),
    );
  const counts = async () => ({
    soon: (await rowsFor(fx.soon)).length,
    past: (await rowsFor(fx.past)).length,
    far: (await rowsFor(fx.far)).length,
    overnight: (await rowsFor(fx.overnight)).length,
  });

  console.log("\n[1] an hourly tick reminds lessons by Cairo wall-clock, not UTC HH:MM");
  await runLessonReminders(TICK);
  const first = await counts();
  const soonRows = await rowsFor(fx.soon);
  assert(first.soon === 1 && soonRows[0]?.userId === fx.student,
    `a 10:30 Cairo lesson is reminded from the 09:00 Cairo tick (rows=${first.soon})`);
  assert(first.past === 0,
    `a 07:30 Cairo lesson (already over; 07:30 is only 'soon' in UTC) gets nothing (rows=${first.past})`);
  assert(first.far === 0, `a 12:00 Cairo lesson, three hours out, waits for a later tick (rows=${first.far})`);

  console.log("\n[2] the window crosses Cairo midnight");
  await runLessonReminders(LATE_TICK);
  assert((await rowsFor(fx.overnight)).length === 1,
    "a 00:30 lesson on the next Cairo day is reminded from the 23:00 Cairo tick");

  console.log("\n[3] a re-fired or overlapping tick never double-notifies");
  const before = await counts();
  await runLessonReminders(TICK);
  await runLessonReminders(LATE_TICK);
  const refired = await counts();
  assert(JSON.stringify(refired) === JSON.stringify(before),
    `re-firing the same ticks adds no rows (before=${JSON.stringify(before)} after=${JSON.stringify(refired)})`);

  const nextTick = new Date(TICK.getTime() + HOUR);
  await runLessonReminders(nextTick);
  await runLessonReminders(nextTick);
  const next = await counts();
  assert(next.soon === 1, `the 10:00 Cairo tick still sees the 10:30 lesson but skips it (rows=${next.soon})`);
  assert(next.far === 1, `the 12:00 lesson is reminded exactly once by the 10:00 Cairo tick (rows=${next.far})`);

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
