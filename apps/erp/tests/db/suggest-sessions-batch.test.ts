import { withPlatformContext } from "@repo/database";
import { suggestSessions } from "@repo/server-core/services/attendance/checkin";
import { coveredStudentIds } from "@repo/server-core/services/subscriptions/coverage";
import type { SessionUser } from "@repo/server-core/auth/types";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "suggest-sessions-batch.test.ts";

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

async function main() {
  const tag = "sgs-" + rid();
  __sweepTag = tag;
  console.log("suggestSessions batched coverage DB tests —", tag);

  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);

  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({
      data: { name: `${tag}-teacher`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
    const owner = await tx.user.create({
      data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" },
    });
    const center = await tx.center.create({
      data: {
        name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18),
        status: "active", ownerUserId: owner.id,
      },
    });
    await tx.centerAdminProfile.create({ data: { userId: owner.id, centerId: center.id } });
    const courseData = (title: string, startTime: string, endTime: string) => ({
      centerId: center.id, teacherId: teacher.id, title, subject: "Math",
      daysOfWeek: [1], startTime, endTime,
      startDate: new Date(Date.now() - 30 * DAY),
      maxStudents: 30, status: "active" as const, price: 40000, pricePerSession: 5000,
    });
    const courseA = await tx.course.create({ data: courseData(`${tag}-A`, "09:00", "10:00") });
    const courseB = await tx.course.create({ data: courseData(`${tag}-B`, "13:00", "14:00") });
    const courseC = await tx.course.create({ data: courseData(`${tag}-C`, "16:00", "17:00") });
    const student = await tx.user.create({
      data: { name: `${tag}-stu`, role: "student", email: `${tag}-s@x.io`, status: "active" },
    });
    await tx.centerStudentRoster.create({ data: { centerId: center.id, studentId: student.id } });

    const session = (courseId: string, startTime: string, endTime: string) =>
      tx.session.create({
        data: {
          courseId, teacherId: teacher.id, originalDate: today, date: today,
          startTime, endTime, status: "scheduled",
        },
      });
    const a1 = await session(courseA.id, "09:00", "10:00");
    const a2 = await session(courseA.id, "11:00", "12:00");
    const b1 = await session(courseB.id, "13:00", "14:00");
    const c1 = await session(courseC.id, "16:00", "17:00");

    const sub = (data: Record<string, unknown>) =>
      tx.subscription.create({
        data: {
          studentId: student.id, targetType: "center", teacherId: teacher.id, centerId: center.id,
          price: 5000, source: "walk_in", activatedAt: today, ...data,
        } as never,
      });
    await sub({ courseId: courseA.id, plan: "per_session", sessionId: a1.id, status: "active" });
    await sub({ courseId: courseA.id, plan: "per_session", sessionId: a2.id, status: "cancelled", cancelledAt: today });
    await sub({
      courseId: courseB.id, plan: "monthly", status: "active",
      periodStart: new Date(today.getTime() - 5 * DAY), periodEnd: new Date(today.getTime() + 20 * DAY),
    });
    await sub({
      courseId: courseC.id, plan: "monthly", status: "active",
      periodStart: new Date(today.getTime() - 40 * DAY), periodEnd: new Date(today.getTime() - 10 * DAY),
    });

    return {
      owner: owner.id, center: center.id, student: student.id,
      sessions: [a1, a2, b1, c1].map((s) => ({ id: s.id, courseId: s.courseId, date: s.date })),
    };
  });

  const owner = { id: fx.owner, role: "center_admin", centerId: fx.center } as unknown as SessionUser;
  const ids = new Set(fx.sessions.map((s) => s.id));

  const reference = await withPlatformContext(async (tx) => {
    const out = new Map<string, boolean>();
    for (const s of fx.sessions) {
      const covered = await coveredStudentIds(tx, s, [fx.student]);
      out.set(s.id, covered.has(fx.student));
    }
    return out;
  });

  const result = await suggestSessions(fx.student, owner);
  const today_ = result.today.filter((e) => ids.has(e.sessionId));
  const suggested = result.suggested.filter((e) => ids.has(e.sessionId));

  assert(today_.length === 4, "all four of today's sessions are listed");
  assert(
    today_.every((e) => e.covered === reference.get(e.sessionId)),
    "batched `covered` equals the per-session coveredStudentIds answer for every session",
  );
  assert(
    suggested.map((e) => e.sessionId).join(",") === [fx.sessions[0]!.id, fx.sessions[2]!.id].join(","),
    "suggested = the per-session pass (A1) + the in-window monthly (B1), in start-time order",
  );
  assert(
    today_.map((e) => e.startTime).join(",") === "09:00,11:00,13:00,16:00",
    "today keeps start-time order",
  );
  assert(
    today_.every((e) => e.pricePerSession === 5000 && e.checkinStatus === null),
    "price and check-in status are carried per row",
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
