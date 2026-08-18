/**
 * Course creation is ATOMIC — a schedule conflict leaves no orphan behind.
 *
 * WHAT WAS BROKEN. `createCourse` committed the course row in one transaction
 * and then called `generateSessions`, which opened a SECOND one. Session
 * generation refuses on a schedule conflict (checkConflicts — teacher OR room
 * double-booked), so a conflicting create threw 409 at the caller while
 * leaving a committed course with ZERO sessions in the center's Classes list:
 * a group nobody can attend, nothing can settle, and nobody asked for. The
 * EDIT path had already been fixed this way (regenerateFutureSessionsTx runs
 * inside updateCourse's transaction); create was never brought along.
 *
 * Proves, for BOTH create paths (center-owned and teacher-direct):
 *  - a TEACHER double-booking is refused, and no course row survives;
 *  - a ROOM double-booking is refused, and no course row survives;
 *  - the happy path still creates the course AND its sessions;
 *  - back-to-back lessons (one ends exactly when the next starts) are NOT a
 *    conflict — the half-open rule in timesOverlap, which is how a center
 *    actually runs its day.
 *
 * Run (all suites, guarded):  bun run --filter edura test:db
 * Run (this one only):        bun run --filter edura test:db:only course-create-atomicity
 * NEVER --env-file=.env.local: that is the DEV database and it skips the guard.
 */
import { withPlatformContext } from "@repo/database";
import {
  createCourse,
  createTeacherDirectCourse,
} from "@repo/server-core/services/center/courses";
import type { SessionUser } from "@/lib/auth/session";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "course-create-atomicity.test.ts";

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

/** Monday well in the future — schedulePattern refuses a past startDate. */
const MONDAY = new Date("2027-03-01T00:00:00Z");
const MONDAY_END = new Date("2027-03-29T00:00:00Z");

function pattern(startTime: string, endTime: string) {
  return {
    daysOfWeek: [1],
    startTime,
    endTime,
    startDate: MONDAY,
    endDate: MONDAY_END,
  };
}

async function countCourses(titlePrefix: string) {
  return withPlatformContext((tx) =>
    tx.course.count({ where: { title: { startsWith: titlePrefix } } }),
  );
}

/** Run a create that is expected to be refused, and report whether it threw. */
async function refused(fn: () => Promise<unknown>) {
  try {
    await fn();
    return { threw: false, message: "" };
  } catch (e) {
    return { threw: true, message: (e as Error).message };
  }
}

async function main() {
  const tag = "coursatomic-" + rid();
  __sweepTag = tag;
  console.log("Course-create atomicity DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const center = await tx.center.create({
      data: {
        name: `${tag}-center`,
        shortId: ("C" + rid() + rid()).slice(0, 12).toUpperCase(),
        status: "active",
        walletBalance: 0,
      },
    });
    const admin = await tx.user.create({
      data: { name: `${tag}-admin`, role: "center_admin", email: `${tag}-admin@x.io`, status: "active" },
    });
    await tx.centerAdminProfile.create({ data: { userId: admin.id, centerId: center.id } });

    const mkTeacher = async (k: string) => {
      const u = await tx.user.create({
        data: { name: `${tag}-${k}`, role: "teacher", email: `${tag}-${k}@x.io`, status: "active" },
      });
      await tx.teacherProfile.create({ data: { userId: u.id } });
      await tx.centerTeacherAffiliation.create({
        data: {
          teacherId: u.id,
          centerId: center.id,
          status: "active",
          expiresAt: new Date("2028-01-01T00:00:00Z"),
        },
      });
      return u.id;
    };
    const teacherA = await mkTeacher("tA");
    const teacherB = await mkTeacher("tB");

    const room = await tx.room.create({
      data: { centerId: center.id, name: `${tag}-hall`, isActive: true },
    });
    const room2 = await tx.room.create({
      data: { centerId: center.id, name: `${tag}-hall2`, isActive: true },
    });

    return { centerId: center.id, adminId: admin.id, teacherA, teacherB, room: room.id, room2: room2.id };
  });

  const admin: SessionUser = {
    id: fx.adminId,
    role: "center_admin",
    centerId: fx.centerId,
  } as SessionUser;

  const base = (title: string, teacherId: string, roomId: string | undefined, times: [string, string]) => ({
    teacherId,
    defaultRoomId: roomId,
    title,
    subject: "math",
    schedulePattern: pattern(times[0], times[1]),
    price: 100000,
    maxStudents: 30,
  });

  // --- happy path: course AND sessions both land ----------------------------
  const first = await createCourse(admin, base(`${tag}-first`, fx.teacherA, fx.room, ["16:00", "18:00"]));
  assert(first.sessionsGenerated > 0, `happy path generated ${first.sessionsGenerated} sessions`);
  const firstSessions = await withPlatformContext((tx) =>
    tx.session.count({ where: { courseId: first.course.id } }),
  );
  assert(firstSessions === first.sessionsGenerated, "sessions are actually persisted");

  // --- TEACHER double-booking ----------------------------------------------
  const beforeTeacher = await countCourses(`${tag}-clash-teacher`);
  const rTeacher = await refused(() =>
    // Same teacher, DIFFERENT hall, overlapping time.
    createCourse(admin, base(`${tag}-clash-teacher`, fx.teacherA, fx.room2, ["17:00", "19:00"])),
  );
  const afterTeacher = await countCourses(`${tag}-clash-teacher`);
  assert(rTeacher.threw, `teacher double-booking REFUSED (${rTeacher.message.slice(0, 60)})`);
  assert(
    afterTeacher === beforeTeacher,
    `NO orphan course row survives the teacher clash (before ${beforeTeacher}, after ${afterTeacher})`,
  );

  // --- ROOM double-booking --------------------------------------------------
  const beforeRoom = await countCourses(`${tag}-clash-room`);
  const rRoom = await refused(() =>
    // DIFFERENT teacher, SAME hall, overlapping time.
    createCourse(admin, base(`${tag}-clash-room`, fx.teacherB, fx.room, ["17:00", "19:00"])),
  );
  const afterRoom = await countCourses(`${tag}-clash-room`);
  assert(rRoom.threw, `room double-booking REFUSED (${rRoom.message.slice(0, 60)})`);
  assert(
    afterRoom === beforeRoom,
    `NO orphan course row survives the room clash (before ${beforeRoom}, after ${afterRoom})`,
  );

  // --- back-to-back is NOT a clash (half-open overlap) ----------------------
  const backToBack = await refused(() =>
    createCourse(admin, base(`${tag}-b2b`, fx.teacherA, fx.room, ["18:00", "20:00"])),
  );
  assert(
    !backToBack.threw,
    "a lesson starting exactly when the previous ends is ALLOWED (half-open overlap)",
  );

  // --- teacher-direct path: same guarantee ----------------------------------
  const teacherUser: SessionUser = { id: fx.teacherB, role: "teacher" } as SessionUser;
  const direct = await createTeacherDirectCourse(teacherUser, {
    title: `${tag}-direct`,
    subject: "physics",
    schedulePattern: pattern("09:00", "11:00"),
    maxStudents: 10,
    pricePerMonth: 50000,
  });
  assert(direct.sessionsGenerated > 0, "teacher-direct happy path generated sessions");

  const beforeDirect = await countCourses(`${tag}-direct-clash`);
  const rDirect = await refused(() =>
    createTeacherDirectCourse(teacherUser, {
      title: `${tag}-direct-clash`,
      subject: "physics",
      schedulePattern: pattern("10:00", "12:00"),
      maxStudents: 10,
      pricePerMonth: 50000,
    }),
  );
  const afterDirect = await countCourses(`${tag}-direct-clash`);
  assert(rDirect.threw, `teacher-direct double-booking REFUSED (${rDirect.message.slice(0, 60)})`);
  assert(
    afterDirect === beforeDirect,
    `NO orphan teacher-direct course survives the clash (before ${beforeDirect}, after ${afterDirect})`,
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
