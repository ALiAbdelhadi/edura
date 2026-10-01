import { withPlatformContext } from "@repo/database";
import {
  bulkMarkAttendance,
  editAttendance,
  getSessionAttendance,
  reopenAttendanceForSettlement,
} from "@repo/server-core/services/attendance/attendance";
import { counterCheckin, doorTransitionTx } from "@repo/server-core/services/attendance/checkin";
import { completeSession } from "@repo/server-core/services/finance/distribution";
import { syncOfflineAttendance } from "@repo/server-core/services/attendance/sync";
import { BusinessRuleError, ForbiddenError } from "@repo/server-core/errors/classes";
import type { SessionUser } from "@repo/server-core/auth/types";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "settled-lesson-lock.test.ts";

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

async function caught(fn: () => Promise<unknown>): Promise<unknown | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}

async function main() {
  const tag = "sll-" + rid();
  __sweepTag = tag;
  console.log("Settled-lesson lock DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({
      data: { name: `${tag}-teacher`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
    const owner = await tx.user.create({
      data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" },
    });
    const s1 = await tx.user.create({
      data: { name: `${tag}-stu1`, role: "student", email: `${tag}-s1@x.io`, status: "active" },
    });
    const s2 = await tx.user.create({
      data: { name: `${tag}-stu2`, role: "student", email: `${tag}-s2@x.io`, status: "active" },
    });
    const center = await tx.center.create({
      data: {
        name: `${tag}-center`,
        shortId: tag.toUpperCase().slice(0, 18),
        status: "active",
        ownerUserId: owner.id,
      },
    });
    await tx.centerTeacherAffiliation.create({
      data: {
        centerId: center.id,
        teacherId: teacher.id,
        status: "active",
        centerShare: 0,
        expiresAt: new Date(Date.now() + 30 * DAY),
      },
    });
    const course = await tx.course.create({
      data: {
        centerId: center.id, teacherId: teacher.id, title: `${tag}-c`, subject: "Math",
        daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: daysAgo(30),
        maxStudents: 30, status: "active", price: 40000,
      },
    });
    for (const stu of [s1, s2]) {
      await tx.enrollment.create({
        data: { studentId: stu.id, courseId: course.id, centerId: center.id, status: "active", enrolledBy: teacher.id },
      });
    }
    const mkSession = () =>
      tx.session.create({
        data: {
          courseId: course.id, teacherId: teacher.id, originalDate: daysAgo(0), date: daysAgo(0),
          startTime: "10:00", endTime: "11:00", status: "scheduled",
        },
      });
    const main = await mkSession(); // will be SETTLED
    const empty = await mkSession(); // completed with nobody, then repaired
    const fresh = await mkSession(); // stays open — the sync sibling

    await tx.attendanceRecord.create({
      data: {
        sessionId: main.id, studentId: s2.id, courseId: course.id, centerId: center.id,
        status: "counter_only", markedBy: owner.id, counterAt: new Date(), counterBy: owner.id,
      },
    });
    await tx.attendanceRecord.create({
      data: {
        sessionId: fresh.id, studentId: s1.id, courseId: course.id, centerId: center.id,
        status: "counter_only", markedBy: owner.id, counterAt: new Date(), counterBy: owner.id,
      },
    });
    return {
      teacher: teacher.id, owner: owner.id, s1: s1.id, s2: s2.id,
      center: center.id, course: course.id,
      main: main.id, empty: empty.id, fresh: fresh.id,
    };
  });

  const teacherUser = { id: fx.teacher, role: "teacher" } as unknown as SessionUser;
  const counterUser = { id: fx.owner, role: "center_admin", centerId: fx.center } as unknown as SessionUser;
  const markMain = () =>
    bulkMarkAttendance(fx.main, [{ studentId: fx.s1, status: "present" }], fx.owner, fx.center);

  console.log("\n[1] baselines — every door is open on a live lesson");
  const marked = await markMain();
  assert(marked.updated === 1, "bulkMarkAttendance accepts a live lesson (s1 present)");
  const preCounter = await caught(() => counterCheckin({ studentId: fx.s1, sessionId: fx.main }, counterUser));
  assert(
    preCounter instanceof BusinessRuleError &&
      (preCounter.details as { code?: string })?.code === "needs_payment",
    "counterCheckin on a live lesson reaches its COVERAGE gate (needs_payment) — the register itself is open",
  );
  const preDoor = await withPlatformContext((tx) =>
    doorTransitionTx(tx, { studentId: fx.s1, sessionId: fx.fresh, actorId: fx.teacher, teacherId: fx.teacher }),
  );
  assert(preDoor.outcome === "present", "doorTransitionTx promotes counter→present on a live lesson");

  console.log("\n[2] settlement closes all five doors");
  const settled = await completeSession(fx.main, teacherUser);
  assert(
    settled.distribution.distributed === true && settled.distribution.presentCount === 1,
    "the lesson really settled (1 present — the counter_only student was excluded, by design)",
  );

  const got = await getSessionAttendance(fx.main, fx.owner, "center_admin", fx.center);
  assert(got.locked === true, "GET reads locked immediately — inside the 7-day window");

  const bulkErr = await caught(markMain);
  assert(
    bulkErr instanceof ForbiddenError && /settled/.test((bulkErr as Error).message),
    "bulkMarkAttendance refuses, naming settlement as the reason",
  );

  const rec = await withPlatformContext((tx) =>
    tx.attendanceRecord.findUnique({
      where: { sessionId_studentId: { sessionId: fx.main, studentId: fx.s1 } },
      select: { id: true },
    }),
  );
  const editErr = await caught(() => editAttendance(rec!.id, "absent", fx.owner, fx.center));
  assert(
    editErr instanceof ForbiddenError && /settled/.test((editErr as Error).message),
    "editAttendance refuses the settled record",
  );

  const counterErr = await caught(() =>
    counterCheckin({ studentId: fx.s2, sessionId: fx.main }, counterUser),
  );
  assert(
    counterErr instanceof BusinessRuleError &&
      (counterErr.details as { code?: string })?.code === "session_closed",
    "counterCheckin refuses with code session_closed — NOT needs_payment: the closed gate fires before coverage",
  );

  const doorRes = await withPlatformContext((tx) =>
    doorTransitionTx(tx, { studentId: fx.s2, sessionId: fx.main, actorId: fx.teacher, teacherId: fx.teacher }),
  );
  assert(
    doorRes.outcome === "settled",
    "[3] the excluded counter_only student CANNOT be door-promoted after settlement (outcome=settled, not already_present)",
  );
  const s2Row = await withPlatformContext((tx) =>
    tx.attendanceRecord.findUnique({
      where: { sessionId_studentId: { sessionId: fx.main, studentId: fx.s2 } },
      select: { status: true },
    }),
  );
  assert(s2Row?.status === "counter_only", "…and their status is untouched — the fact the money ignored never moves");

  const sync = await syncOfflineAttendance(
    [
      { sessionId: fx.main, studentId: fx.s2, status: "present" },
      { sessionId: fx.fresh, studentId: fx.s2, status: "present" },
    ],
    teacherUser,
  );
  const syncMain = sync.results.find((r) => r.sessionId === fx.main);
  const syncFresh = sync.results.find((r) => r.sessionId === fx.fresh);
  assert(
    syncMain?.result === "conflict" && syncMain?.reason === "session_settled",
    "offline sync into the settled lesson → per-record conflict: session_settled",
  );
  assert(
    syncFresh?.result === "synced",
    "…while the unsettled sibling IN THE SAME BATCH still syncs — the batch degrades per record",
  );

  const reopenErr = await caught(() =>
    reopenAttendanceForSettlement(fx.main, {
      kind: "teacher", actingTeacherId: fx.teacher, actorId: fx.teacher, onBehalfOf: null,
    }),
  );
  assert(reopenErr instanceof BusinessRuleError, "reopen refuses the settled lesson — settled attendance never reopens");

  console.log("\n[4] completed-with-nobody: locked at the button, repaired through the audited door");
  const emptyDone = await completeSession(fx.empty, teacherUser);
  assert(
    emptyDone.distribution.distributed === false && emptyDone.distribution.reason === "no_present_students",
    "ending an empty lesson completes it without distributing",
  );
  const emptyBulkErr = await caught(() =>
    bulkMarkAttendance(fx.empty, [{ studentId: fx.s1, status: "present" }], fx.owner, fx.center),
  );
  assert(
    emptyBulkErr instanceof ForbiddenError && /reopen/.test((emptyBulkErr as Error).message),
    "attendance refuses IMMEDIATELY (in-window!) and points at the reopen door",
  );
  const reopened = await reopenAttendanceForSettlement(fx.empty, {
    kind: "teacher", actingTeacherId: fx.teacher, actorId: fx.teacher, onBehalfOf: null,
  });
  assert(reopened.locked === false, "the audited reopen unlocks the prematurely closed register");
  const repaired = await bulkMarkAttendance(
    fx.empty, [{ studentId: fx.s1, status: "present" }], fx.owner, fx.center,
  );
  assert(repaired.updated === 1, "the correction lands");
  const emptySettled = await completeSession(fx.empty, teacherUser);
  assert(
    emptySettled.distribution.distributed === true,
    "completing again settles the repaired lesson",
  );
  const emptyRelockErr = await caught(() =>
    bulkMarkAttendance(fx.empty, [{ studentId: fx.s1, status: "absent" }], fx.owner, fx.center),
  );
  const emptyReopen2 = await caught(() =>
    reopenAttendanceForSettlement(fx.empty, {
      kind: "teacher", actingTeacherId: fx.teacher, actorId: fx.teacher, onBehalfOf: null,
    }),
  );
  assert(
    emptyRelockErr instanceof ForbiddenError && emptyReopen2 instanceof BusinessRuleError,
    "…and settlement re-arms the lock for good: write refuses, reopen refuses",
  );

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
