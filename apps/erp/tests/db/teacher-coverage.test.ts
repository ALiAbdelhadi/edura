import { withPlatformContext } from "@repo/database";
import { getTeacherCoverage } from "@repo/server-core/services/subscriptions/teacher-coverage";
import { NotFoundError } from "@repo/server-core/errors/classes";
import type { SessionUser } from "@repo/server-core/erp-auth/session";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "teacher-coverage.test.ts";

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
const su = (id: string): SessionUser => ({ id, role: "teacher" }) as SessionUser;

const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY);

async function main() {
  const tag = "tcov-" + rid();
  __sweepTag = tag;
  console.log("Teacher coverage DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const mkUser = (k: string, role: "teacher" | "student") =>
      tx.user.create({ data: { name: `${tag}-${k}`, role, email: `${tag}-${k}@x.io`, status: "active" } });

    const teacher = await mkUser("teacher", "teacher");
    const rival = await mkUser("rival", "teacher");
    const covered = await mkUser("covered", "student");
    const lapsed = await mkUser("lapsed", "student");
    const never = await mkUser("never", "student");
    const payg = await mkUser("payg", "student");

    const mkCourse = (owner: string, k: string) =>
      tx.course.create({
        data: {
          centerId: null, teacherId: owner, title: `${tag}-${k}`, subject: "Math",
          daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date("2026-01-01T00:00:00Z"),
          maxStudents: 30, status: "active", price: 40000, pricePerMonth: 40000, pricePerSession: 5000,
        },
      });
    const course = await mkCourse(teacher.id, "cT");
    const courseR = await mkCourse(rival.id, "cR");

    for (const s of [covered, lapsed, never, payg]) {
      await tx.enrollment.create({
        data: { studentId: s.id, courseId: course.id, centerId: null, status: "active", enrolledBy: teacher.id },
      });
    }

    const subBase = {
      targetType: "teacher" as const,
      teacherId: teacher.id,
      centerId: null,
      courseId: course.id,
      source: "online" as const,
    };
    await tx.subscription.create({
      data: { ...subBase, studentId: covered.id, plan: "monthly", price: 40000, status: "active",
        activatedAt: daysFromNow(-5), periodStart: daysFromNow(-5), periodEnd: daysFromNow(25) },
    });
    const lapsedEnd = daysFromNow(-3);
    await tx.subscription.create({
      data: { ...subBase, studentId: lapsed.id, plan: "monthly", price: 40000, status: "expired",
        activatedAt: daysFromNow(-33), periodStart: daysFromNow(-33), periodEnd: lapsedEnd },
    });
    await tx.subscription.create({
      data: { ...subBase, studentId: never.id, plan: "monthly", price: 40000, status: "pending_payment" },
    });
    const passSession = await tx.session.create({
      data: {
        courseId: course.id, teacherId: teacher.id, originalDate: daysFromNow(-2), date: daysFromNow(-2),
        startTime: "10:00", endTime: "11:00", status: "completed",
      },
    });
    await tx.subscription.create({
      data: { ...subBase, studentId: payg.id, plan: "per_session", sessionId: passSession.id,
        price: 5000, status: "active", activatedAt: daysFromNow(-2) },
    });

    return {
      teacher: teacher.id, rival: rival.id, course: course.id, courseR: courseR.id,
      covered: covered.id, lapsed: lapsed.id, never: never.id, payg: payg.id,
      lapsedEnd,
    };
  });

  console.log("\n[1] the four states, from real rows");
  const res = await getTeacherCoverage(su(fx.teacher));
  const group = res.groups.find((g) => g.courseId === fx.course);
  assert(!!group, "the teacher's group is in the default listing");
  const by = new Map(group!.students.map((s) => [s.studentId, s]));

  const cov = by.get(fx.covered);
  assert(cov?.state === "covered", "active monthly window containing now → covered");
  assert(cov?.coveredUntil != null && Math.abs(cov.coveredUntil.getTime() - daysFromNow(25).getTime()) < DAY,
    "coveredUntil is the window end");

  const lap = by.get(fx.lapsed);
  assert(lap?.state === "lapsed", "ended monthly window → lapsed");
  assert(lap?.lastCoveredUntil?.getTime() === fx.lapsedEnd.getTime(), "lastCoveredUntil says when coverage ended");

  assert(by.get(fx.never)?.state === "none", "pending_payment alone reads as none — an unpaid checkout never covered anyone");
  const pg = by.get(fx.payg);
  assert(pg?.state === "per_session" && pg.passesInPeriod === 1, "a pass for a session in the period → per_session, counted");

  console.log("\n[2] counts and order");
  assert(
    group!.counts.covered === 1 && group!.counts.lapsed === 1 && group!.counts.none === 1 && group!.counts.per_session === 1,
    "counts agree with the rows",
  );
  assert(group!.students[0]?.state === "lapsed", "lapsed sorts first — it is the question");
  assert(group!.plans.monthly && group!.plans.perSession, "plan availability is reported from the course row");
  assert(typeof res.period.from === "string" && typeof res.period.to === "string",
    "the default period is echoed so the pass counts are interpretable");

  console.log("\n[3] reach");
  let threw = false;
  try {
    await getTeacherCoverage(su(fx.teacher), { courseId: fx.courseR });
  } catch (e) {
    threw = e instanceof NotFoundError;
  }
  assert(threw, "another teacher's courseId → NotFound (never Forbidden — existence leaks nothing)");
  const rivalRes = await getTeacherCoverage(su(fx.rival));
  assert(!rivalRes.groups.some((g) => g.courseId === fx.course), "the rival's default listing does not contain this group");

  console.log("\n[4] courseId filter");
  const one = await getTeacherCoverage(su(fx.teacher), { courseId: fx.course });
  assert(one.groups.length === 1 && one.groups[0].courseId === fx.course, "courseId narrows to the named group");

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
