/**
 * T-9 — the lock becomes real, and yields through a door (API session 2,
 * item B.1#7; docs/decisions/attendance-reopen-settlement.md).
 *
 * What is proven here, against the real services:
 *   1. THE BYPASS IS CLOSED: `bulkMarkAttendance` now refuses a session past
 *      the 7-day window — the same lock the GET reports. (Before this change
 *      the GET said `locked: true` while this exact call went through.)
 *   2. THE DOOR WORKS: `reopenAttendanceForSettlement` unlocks the stranded
 *      case (past window, never settled), the GET agrees, bulk marking then
 *      succeeds, and the reopen writes its audit row.
 *   3. THE REFUSALS HOLD: in-window sessions ("no reopen needed"), a rival
 *      teacher (NotFound), a second reopen, and a settled lesson all refuse.
 *   4. SETTLEMENT RE-ARMS THE LOCK PERMANENTLY: with `distributedAt` set, the
 *      session reads locked again even though the reopen fact is still there,
 *      and the bulk write refuses again.
 *
 * Run (all suites, guarded):  bun run --filter edura test:db
 * Run (this one only):        bun run --filter edura test:db:only t9-attendance-reopen
 * NEVER --env-file=.env.local: that is the DEV database and it skips the guard.
 */
import { withPlatformContext } from "@repo/database";
import {
  bulkMarkAttendance,
  getSessionAttendance,
  reopenAttendanceForSettlement,
} from "@repo/server-core/services/attendance/attendance";
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
} from "@repo/server-core/errors/classes";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "t9-attendance-reopen.test.ts";

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
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

async function expectError(
  fn: () => Promise<unknown>,
  kind: "notfound" | "rule" | "forbidden",
): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e) {
    if (kind === "notfound") return e instanceof NotFoundError;
    if (kind === "forbidden") return e instanceof ForbiddenError;
    return e instanceof BusinessRuleError;
  }
}

async function main() {
  const tag = "t9ro-" + rid();
  __sweepTag = tag;
  console.log("T-9 attendance reopen DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({
      data: { name: `${tag}-teacher`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
    const rival = await tx.user.create({
      data: { name: `${tag}-rival`, role: "teacher", email: `${tag}-r@x.io`, status: "active" },
    });
    const student = await tx.user.create({
      data: { name: `${tag}-student`, role: "student", email: `${tag}-s@x.io`, status: "active" },
    });
    const course = await tx.course.create({
      data: {
        centerId: null, teacherId: teacher.id, title: `${tag}-c`, subject: "Math",
        daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: daysAgo(60),
        maxStudents: 30, status: "active", price: 40000,
      },
    });
    await tx.enrollment.create({
      data: { studentId: student.id, courseId: course.id, centerId: null, status: "active", enrolledBy: teacher.id },
    });
    const mkSession = (when: Date) =>
      tx.session.create({
        data: { courseId: course.id, teacherId: teacher.id, originalDate: when, date: when,
          startTime: "10:00", endTime: "11:00", status: "scheduled" },
      });
    const stranded = await mkSession(daysAgo(12)); // the T-9 case

    // The CENTER case — an EXTERNAL teacher's lesson. External teachers have
    // no account (docs/decisions/external-teachers.md), so the center is the
    // actor of record and past-lesson catch-up is a designed flow that
    // buildGapReport prompts. Without a center door the lock would delete that
    // capability instead of guarding it; this fixture is the proof it did not.
    const center = await tx.center.create({
      data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18) },
    });
    const centerCourse = await tx.course.create({
      data: {
        centerId: center.id, teacherId: teacher.id, title: `${tag}-ext`, subject: "Math",
        daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: daysAgo(60),
        maxStudents: 30, status: "active", price: 40000, dataSource: "manual",
      },
    });
    await tx.centerStudentRoster.create({ data: { centerId: center.id, studentId: student.id } });
    await tx.enrollment.create({
      data: { studentId: student.id, courseId: centerCourse.id, centerId: center.id,
        status: "active", enrolledBy: teacher.id },
    });
    const centerStranded = await tx.session.create({
      data: { courseId: centerCourse.id, teacherId: teacher.id, originalDate: daysAgo(30), date: daysAgo(30),
        startTime: "10:00", endTime: "11:00", status: "scheduled", dataSource: "manual" },
    });
    const owner = await tx.user.create({
      data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" },
    });
    await tx.center.update({ where: { id: center.id }, data: { ownerUserId: owner.id } });
    const fresh = await mkSession(daysAgo(1)); // inside the window
    const settled = await tx.session.create({
      data: { courseId: course.id, teacherId: teacher.id, originalDate: daysAgo(20), date: daysAgo(20),
        startTime: "10:00", endTime: "11:00", status: "completed", distributedAt: daysAgo(19) },
    });
    return { teacher: teacher.id, rival: rival.id, student: student.id,
      stranded: stranded.id, fresh: fresh.id, settled: settled.id,
      center: center.id, owner: owner.id, centerStranded: centerStranded.id };
  });

  const mark = (sessionId: string) =>
    bulkMarkAttendance(sessionId, [{ studentId: fx.student, status: "present" }], fx.teacher, null);

  console.log("\n[1] the bypass is closed");
  const before = await getSessionAttendance(fx.stranded, fx.teacher, "teacher");
  assert(before.locked === true, "a 12-day-old session reads locked");
  assert(
    await expectError(() => mark(fx.stranded), "forbidden"),
    "…and bulkMarkAttendance now REFUSES it — the GET and the PUT finally agree",
  );

  console.log("\n[2] the refusals hold");
  assert(
    await expectError(
      () => reopenAttendanceForSettlement(fx.fresh, { kind: "teacher", actingTeacherId: fx.teacher, actorId: fx.teacher, onBehalfOf: null }),
      "rule",
    ),
    "an in-window session refuses reopen — the register is still open, edit directly",
  );
  assert(
    await expectError(
      () => reopenAttendanceForSettlement(fx.stranded, { kind: "teacher", actingTeacherId: fx.rival, actorId: fx.rival, onBehalfOf: null }),
      "notfound",
    ),
    "a rival teacher's reopen → NotFound (never Forbidden)",
  );
  assert(
    await expectError(
      () => reopenAttendanceForSettlement(fx.settled, { kind: "teacher", actingTeacherId: fx.teacher, actorId: fx.teacher, onBehalfOf: null }),
      "rule",
    ),
    "a settled lesson refuses — settled attendance never reopens, no force path",
  );

  console.log("\n[3] the door works");
  const reopened = await reopenAttendanceForSettlement(fx.stranded, {
    kind: "teacher", actingTeacherId: fx.teacher, actorId: fx.teacher, onBehalfOf: null,
  });
  assert(reopened.locked === false && reopened.attendanceReopenedAt instanceof Date, "reopen returns unlocked, with the fact");
  const after = await getSessionAttendance(fx.stranded, fx.teacher, "teacher");
  assert(after.locked === false, "the GET now reads unlocked");
  const marked = await mark(fx.stranded);
  assert(marked.updated === 1, "attendance can finally be recorded — the stranded loop is broken");
  const audit = await withPlatformContext((tx) =>
    tx.auditLog.findFirst({ where: { action: "attendance.reopen", targetId: fx.stranded }, select: { actorId: true } }),
  );
  assert(audit?.actorId === fx.teacher, "the reopen wrote its audit row");
  assert(
    await expectError(
      () => reopenAttendanceForSettlement(fx.stranded, { kind: "teacher", actingTeacherId: fx.teacher, actorId: fx.teacher, onBehalfOf: null }),
      "rule",
    ),
    "a second reopen refuses — no duplicate audit for a no-op",
  );

  console.log("\n[4] settlement re-arms the lock permanently");
  await withPlatformContext((tx) =>
    tx.session.update({ where: { id: fx.stranded }, data: { distributedAt: new Date(), status: "completed" } }),
  );
  const relocked = await getSessionAttendance(fx.stranded, fx.teacher, "teacher");
  assert(relocked.locked === true, "with distributedAt set the session reads locked again — reopen fact notwithstanding");
  assert(
    await expectError(() => mark(fx.stranded), "forbidden"),
    "…and the bulk write refuses again: the facts the money was computed from never move",
  );

  console.log("\n[5] the CENTER door — external teachers have no account to act with");
  const centerMark = () =>
    bulkMarkAttendance(fx.centerStranded, [{ studentId: fx.student, status: "present" }], fx.owner, fx.center);
  assert(
    await expectError(centerMark, "forbidden"),
    "a 30-day-old external-teacher lesson is locked for the centre too — one rule, no silent bypass",
  );
  assert(
    await expectError(
      () => reopenAttendanceForSettlement(fx.stranded, {
        kind: "center", centerId: fx.center, actorId: fx.owner, onBehalfOf: null,
      }),
      "notfound",
    ),
    "…but only over its OWN courses: a TEACHER-DIRECT lesson (NULL centre) refuses the centre door",
  );
  const centerReopened = await reopenAttendanceForSettlement(fx.centerStranded, {
    kind: "center", centerId: fx.center, actorId: fx.owner, onBehalfOf: null,
  });
  assert(centerReopened.locked === false, "the centre reopens its own external-teacher lesson");
  const centerMarked = await centerMark();
  assert(centerMarked.updated === 1, "…and can finally record the attendance the gap report asked for");
  const centerAudit = await withPlatformContext((tx) =>
    tx.auditLog.findFirst({
      where: { action: "attendance.reopen", targetId: fx.centerStranded },
      select: { actorId: true, afterState: true },
    }),
  );
  assert(centerAudit?.actorId === fx.owner, "audited to the real centre actor");
  assert((centerAudit?.afterState as { by?: string })?.by === "center",
    "…and the audit names WHICH door was used");

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
