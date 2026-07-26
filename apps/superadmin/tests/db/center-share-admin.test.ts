/**
 * Center-share governance (superadmin side) — the flat no-room share is
 * settable ONLY here, and settlement consumes exactly what superadmin set.
 *
 * Companion to apps/www/tests/db/center-share-governance.test.ts (which proves
 * neither the teacher nor the center can propose the number). Proves:
 *  VP1  the listing surfaces each arrangement + whether a hall-free course
 *       actually consumes the value.
 *  VP2  superadmin sets it, and a NO-ROOM session then settles at exactly that
 *       value through the existing append-only ledger.
 *  VP3  the write is audited (actor + before/after).
 *  VP4  invalid amounts and cross-center affiliations are rejected.
 *
 * Run (all suites, guarded):  pnpm --filter superadmin test:db
 * Run (this one only):        pnpm --filter superadmin test:db:only center-share-admin
 * NEVER --env-file=.env.local: that is the DEV database and it skips the guard.
 */
import { withPlatformContext } from "@repo/database";
import { completeSession } from "@/lib/services/finance/distribution";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

// Fixture teardown + the environment guard, wired at the module edge so
// neither depends on remembering to do it inside a proof.
//  * __sweepTag is set where the suite builds its tag; runGuarded() sweeps it
//    in a finally, so an assertion that THROWS still cleans up.
//  * assertDbEnv runs before the first fixture: running this file directly
//    with --env-file=.env.local (which skips pretest:db) is now refused here,
//    not just by the npm script.
let __sweepTag = "";
const SUITE_NAME = "center-share-admin.test.ts";

import {
  getCenterAffiliations,
  updateAffiliationCenterShare,
} from "@/lib/services/admin/rooms-split";

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
async function expectThrows(fn: () => Promise<unknown>, match: string, msg: string) {
  try {
    await fn();
    assert(false, `${msg} (did not throw)`);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    assert(m.includes(match), `${msg} (threw: ${m.slice(0, 120)})`);
  }
}

const rid = () => Math.floor(Math.random() * 1e9).toString(36);
const PRICE = 20000;

async function main() {
  const tag = "shadm-" + rid();
  __sweepTag = tag;
  console.log("Center-share admin DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const su = await tx.user.create({
      data: { name: `${tag}-su`, role: "super_admin", email: `${tag}-su@x.io`, status: "active" },
    });
    const teacher = await tx.user.create({
      data: { name: `${tag}-t`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
    await tx.teacherProfile.create({ data: { userId: teacher.id, walletBalance: 0 } });
    const center = await tx.center.create({
      data: {
        name: `${tag}-c`,
        shortId: ("A" + rid() + rid()).slice(0, 12).toUpperCase(),
        status: "active",
        walletBalance: 0,
      },
    });
    const student = await tx.user.create({
      data: { name: `${tag}-s`, role: "student", email: `${tag}-s@x.io`, status: "active" },
    });
    await tx.studentProfile.create({
      data: {
        userId: student.id,
        fullName: `${tag}-s`,
        familyLinkCode: (tag + rid()).slice(0, 18),
        pointsBalance: 0,
      },
    });
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    const aff = await tx.centerTeacherAffiliation.create({
      data: {
        centerId: center.id,
        teacherId: teacher.id,
        status: "active",
        centerShare: 0, // what acceptance now creates
        respondedAt: new Date(),
        expiresAt,
      },
    });
    // A NO-ROOM course — the only kind that consumes the flat share.
    const course = await tx.course.create({
      data: {
        centerId: center.id,
        teacherId: teacher.id,
        title: `${tag}-noroom`,
        subject: "Math",
        daysOfWeek: [1],
        startTime: "10:00",
        endTime: "11:00",
        startDate: new Date("2026-03-02T00:00:00Z"),
        price: PRICE,
        maxStudents: 30,
        status: "active",
      },
    });
    const session = await tx.session.create({
      data: {
        courseId: course.id,
        teacherId: teacher.id,
        originalDate: new Date("2026-03-09T10:00:00Z"),
        date: new Date("2026-03-09T10:00:00Z"),
        startTime: "10:00",
        endTime: "11:00",
        status: "scheduled",
      },
    });
    await tx.attendanceRecord.create({
      data: {
        sessionId: session.id,
        studentId: student.id,
        courseId: course.id,
        centerId: center.id,
        status: "present",
        markedBy: teacher.id,
      },
    });
    return {
      su: su.id,
      teacher: teacher.id,
      center: center.id,
      aff: aff.id,
      sessionId: session.id,
    };
  });
  const su = { id: fx.su, role: "super_admin" } as never;

  // ---------------------------------------------------------------- VP1
  console.log("\nVP1 — listing surfaces the arrangement and whether it is live");
  const listing = await getCenterAffiliations(fx.center);
  const row = listing.affiliations.find((a) => a.teacherId === fx.teacher);
  assert(!!row && row.centerShare === 0, "arrangement listed at 0 (what acceptance creates)");
  assert(!!row && row.noRoomCourses === 1, "…flagged as consumed by 1 hall-free course");

  // ---------------------------------------------------------------- VP2
  console.log("\nVP2 — superadmin sets it; the no-room session settles at that value");
  await updateAffiliationCenterShare(fx.center, fx.aff, 2500, su); // 25 EGP/student

  const before = await withPlatformContext(async (tx) => ({
    center: (await tx.center.findUnique({ where: { id: fx.center }, select: { walletBalance: true } }))!.walletBalance,
    teacher: (await tx.teacherProfile.findUnique({ where: { userId: fx.teacher }, select: { walletBalance: true } }))!.walletBalance,
  }));
  const dist = await completeSession(fx.sessionId, { id: fx.teacher, role: "teacher" } as never);
  const after = await withPlatformContext(async (tx) => ({
    center: (await tx.center.findUnique({ where: { id: fx.center }, select: { walletBalance: true } }))!.walletBalance,
    teacher: (await tx.teacherProfile.findUnique({ where: { userId: fx.teacher }, select: { walletBalance: true } }))!.walletBalance,
  }));

  assert(
    dist.distribution.centerShare === 2500,
    `settlement used the SUPERADMIN share (got ${dist.distribution.centerShare})`,
  );
  // Legacy no-room path: center gets share − platform center fee; teacher gets
  // price − platform teacher fee − share. Fees come from commission_settings.
  const fees = await withPlatformContext((tx) =>
    tx.commissionSetting.findFirst({ where: { scope: "global" } }),
  );
  const tFee = fees?.platformTeacherFee ?? 200;
  const cFee = fees?.platformCenterFee ?? 200;
  assert(
    after.center - before.center === 2500 - cFee,
    `center wallet moved by share − platform fee (got ${after.center - before.center})`,
  );
  assert(
    after.teacher - before.teacher === PRICE - tFee - 2500,
    `teacher wallet moved by price − fee − share (got ${after.teacher - before.teacher})`,
  );
  const ledger = await withPlatformContext((tx) =>
    tx.transaction.findMany({ where: { lessonId: fx.sessionId } }),
  );
  assert(ledger.length === 3, `settled through the SAME ledger shape (3 rows, got ${ledger.length})`);

  // ---------------------------------------------------------------- VP3
  console.log("\nVP3 — the write is audited");
  const audit = await withPlatformContext((tx) =>
    tx.auditLog.findFirst({
      where: { action: "affiliation.center_share.updated", targetId: fx.aff },
      orderBy: { createdAt: "desc" },
    }),
  );
  const afterState = (audit?.afterState ?? {}) as Record<string, unknown>;
  assert(!!audit && audit.actorId === fx.su, "audit row records the acting superadmin");
  assert(
    afterState.before === 0 && afterState.after === 2500,
    `audit records before/after (${JSON.stringify(afterState)})`,
  );

  // ---------------------------------------------------------------- VP4
  console.log("\nVP4 — validation");
  await expectThrows(
    () => updateAffiliationCenterShare(fx.center, fx.aff, -5, su),
    "whole number of piasters",
    "a negative share is rejected",
  );
  await expectThrows(
    () => updateAffiliationCenterShare(fx.center, fx.aff, 100_000_000, su),
    "whole number of piasters",
    "an absurdly large share is rejected",
  );
  await expectThrows(
    () =>
      updateAffiliationCenterShare(
        "00000000-0000-0000-0000-000000000000",
        fx.aff,
        100,
        su,
      ),
    "not found",
    "an affiliation belonging to another center is rejected",
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
