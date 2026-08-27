import { withPlatformContext } from "@repo/database";
import {
  completeSession,
  previewSessionSettlement,
} from "@repo/server-core/services/finance/distribution";
import { bulkMarkAttendance } from "@repo/server-core/services/attendance/attendance";
import type { SessionUser } from "@repo/server-core/auth/types";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "settlements-for-all.test.ts";

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
  const tag = "sfa-" + rid();
  __sweepTag = tag;
  console.log("Settlements-for-all DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({
      data: { name: `${tag}-teacher`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
    await tx.teacherProfile.create({ data: { userId: teacher.id, walletBalance: 0 } });
    const owner = await tx.user.create({
      data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" },
    });
    const center = await tx.center.create({
      data: {
        name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18),
        status: "active", ownerUserId: owner.id, walletBalance: 0,
      },
    });
    await tx.centerTeacherAffiliation.create({
      data: {
        centerId: center.id, teacherId: teacher.id, status: "active",
        centerShare: 1000, // 10 EGP flat per student, so centerTotal is non-zero
        expiresAt: new Date(Date.now() + 30 * DAY),
      },
    });
    const course = await tx.course.create({
      data: {
        centerId: center.id, teacherId: teacher.id, title: `${tag}-c`, subject: "Math",
        daysOfWeek: [1], startTime: "10:00", endTime: "11:00",
        startDate: new Date(Date.now() - 30 * DAY),
        maxStudents: 30, status: "active", price: 0, pricePerSession: 5000,
        settlementBasis: "session_price",
      },
    });
    const students: string[] = [];
    for (let i = 0; i < 3; i++) {
      const stu = await tx.user.create({
        data: { name: `${tag}-stu${i}`, role: "student", email: `${tag}-s${i}@x.io`, status: "active" },
      });
      students.push(stu.id);
      await tx.enrollment.create({
        data: { studentId: stu.id, courseId: course.id, centerId: center.id, status: "active", enrolledBy: teacher.id },
      });
    }
    const session = await tx.session.create({
      data: {
        courseId: course.id, teacherId: teacher.id,
        originalDate: new Date(), date: new Date(),
        startTime: "10:00", endTime: "11:00", status: "scheduled",
      },
    });
    for (const stu of [students[0], students[1]]) {
      await tx.subscription.create({
        data: {
          studentId: stu, targetType: "center", teacherId: teacher.id, centerId: center.id,
          courseId: course.id, sessionId: session.id, plan: "per_session", price: 5000,
          paymentMethod: "online_paymob", status: "active", source: "online", activatedAt: new Date(),
        },
      });
    }
    await tx.attendanceRecord.create({
      data: {
        sessionId: session.id, studentId: students[2], courseId: course.id, centerId: center.id,
        status: "counter_only", markedBy: owner.id, counterAt: new Date(), counterBy: owner.id,
      },
    });
    return { teacher: teacher.id, owner: owner.id, center: center.id, course: course.id, students, session: session.id };
  });

  const owner = { id: fx.owner, role: "center_admin", centerId: fx.center } as unknown as SessionUser;

  await bulkMarkAttendance(
    fx.session,
    [
      { studentId: fx.students[0], status: "present" },
      { studentId: fx.students[1], status: "present" },
    ],
    fx.owner,
    fx.center,
  );

  console.log("\n[2] the preview names the excluded");
  const preview = await previewSessionSettlement(fx.session, owner);
  assert(preview.counterOnlyCount === 1, "counterOnlyCount = 1 (the never-doored student)");
  assert(preview.presentCount === 2, "presentCount = 2 — the money never saw them");

  console.log("\n[1] a no-room lesson files a settlement equal to its ledger");
  const walletsBefore = await withPlatformContext(async (tx) => ({
    teacher: (await tx.teacherProfile.findUnique({ where: { userId: fx.teacher }, select: { walletBalance: true } }))!.walletBalance,
    center: (await tx.center.findUnique({ where: { id: fx.center }, select: { walletBalance: true } }))!.walletBalance,
  }));

  const done = await completeSession(fx.session, owner);
  assert(
    done.distribution.distributed === true && done.distribution.presentCount === 2,
    "the lesson settled for exactly the 2 present students",
  );

  const after = await withPlatformContext(async (tx) => {
    const settlement = await tx.sessionSettlement.findUnique({ where: { sessionId: fx.session } });
    const payments = await tx.transaction.aggregate({
      where: { lessonId: fx.session, type: "payment" },
      _sum: { amount: true },
    });
    const commissions = await tx.transaction.aggregate({
      where: { lessonId: fx.session, type: "commission" },
      _sum: { amount: true },
    });
    const teacherWallet = (await tx.teacherProfile.findUnique({
      where: { userId: fx.teacher }, select: { walletBalance: true },
    }))!.walletBalance;
    const centerWallet = (await tx.center.findUnique({
      where: { id: fx.center }, select: { walletBalance: true },
    }))!.walletBalance;
    return { settlement, payments, commissions, teacherWallet, centerWallet };
  });

  const st = after.settlement;
  assert(st !== null, "session_settlements row EXISTS for a no-room lesson");
  assert(st?.pricingMethod === null, "pricing_method is NULL — honestly 'the legacy no-room model'");
  assert(st?.presentCount === 2 && st?.perSessionPrice === 5000, "frozen present_count 2 at 50 EGP/lesson");
  assert(
    (after.payments._sum.amount ?? 0) === 10000 && (st?.presentCount ?? 0) * (st?.perSessionPrice ?? 0) === 10000,
    "gross: Σ ledger payment rows = 100 EGP = present × price",
  );
  assert(
    st?.platformTotal === (after.commissions._sum.amount ?? 0),
    `platform_total equals Σ ledger commission rows (${st?.platformTotal})`,
  );
  assert(
    after.teacherWallet - walletsBefore.teacher === st?.teacherTotal,
    `teacher_total equals the teacher wallet delta (${st?.teacherTotal})`,
  );
  assert(
    after.centerWallet - walletsBefore.center === st?.centerTotal,
    `center_total equals the center wallet delta (${st?.centerTotal})`,
  );
  assert(
    st!.teacherTotal + st!.centerTotal + st!.platformTotal === 10000,
    "the three totals conserve to the gross — nothing minted, nothing lost",
  );

  console.log("\n[3] exactly-once holds");
  const replay = await completeSession(fx.session, owner);
  assert(
    replay.distribution.distributed === false && replay.distribution.reason === "already_distributed",
    "replaying completeSession distributes nothing",
  );
  const count = await withPlatformContext((tx) =>
    tx.sessionSettlement.count({ where: { sessionId: fx.session } }),
  );
  assert(count === 1, "…and files no second settlement row");

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
