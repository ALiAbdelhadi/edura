import { withPlatformContext } from "@repo/database";
import { completeSession } from "@repo/server-core/services/finance/distribution";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "center-share-admin.test.ts";

import {
  getCenterAffiliations,
  updateAffiliationCenterShare,
} from "@repo/server-core/backoffice/admin/rooms-split";

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

  console.log("\nVP1 — listing surfaces the arrangement and whether it is live");
  const listing = await getCenterAffiliations(fx.center);
  const row = listing.affiliations.find((a) => a.teacherId === fx.teacher);
  assert(!!row && row.centerShare === 0, "arrangement listed at 0 (what acceptance creates)");
  assert(!!row && row.noRoomCourses === 1, "…flagged as consumed by 1 hall-free course");

  console.log("\nVP2 — superadmin sets it; the no-room session settles at that value");
  await updateAffiliationCenterShare(fx.center, fx.aff, 2500, su); // 25 EGP/student

  const snapshot = () =>
    withPlatformContext(async (tx) => {
      const c = (await tx.center.findUnique({
        where: { id: fx.center },
        select: { walletBalance: true, creditBalance: true },
      }))!;
      return {
        center: c.walletBalance,
        credit: c.creditBalance,
        teacher: (await tx.teacherProfile.findUnique({ where: { userId: fx.teacher }, select: { walletBalance: true } }))!.walletBalance,
      };
    });
  const before = await snapshot();
  const dist = await completeSession(fx.sessionId, { id: fx.teacher, role: "teacher" } as never);
  const after = await snapshot();

  const fees = await withPlatformContext((tx) =>
    tx.commissionSetting.findFirst({ where: { scope: "global" } }),
  );
  const tFee = fees?.platformTeacherFee ?? 200;
  const cFee = fees?.platformCenterFee ?? 200;

  const centerNet = dist.distribution.centerNetTotal;
  const seen = dist.distribution.presentCount;
  assert(
    centerNet === (2500 - cFee) * (seen ?? 0),
    `settlement used the SUPERADMIN share (center net ${centerNet} === (2500 − ${cFee}) × ${seen})`,
  );
  assert(
    after.center - before.center === 0,
    `center wallet NOT credited, center-held (got ${after.center - before.center})`,
  );
  assert(
    after.credit - before.credit === -(PRICE - tFee - 2500 + tFee + cFee),
    `center credit debited teacher net + fees (got ${after.credit - before.credit})`,
  );
  assert(
    after.teacher - before.teacher === PRICE - tFee - 2500,
    `teacher wallet moved by price − fee − share (got ${after.teacher - before.teacher})`,
  );
  const ledger = await withPlatformContext((tx) =>
    tx.transaction.findMany({ where: { lessonId: fx.sessionId } }),
  );
  assert(ledger.length === 3, `settled through the SAME ledger shape (3 rows, got ${ledger.length})`);

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
