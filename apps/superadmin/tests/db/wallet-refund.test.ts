import { withPlatformContext } from "@repo/database";
import { completeSession } from "@repo/server-core/services/finance/distribution";
import { refundLessonForStudent } from "@repo/server-core/backoffice/finance/refunds";
import type { SessionUser } from "@repo/server-core/backoffice-auth/session";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "wallet-refund.test.ts";

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

async function buildDistributedLesson(tag: string) {
  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({
      data: { name: tag + "-t", role: "teacher", email: tag + "-t@x.io", status: "active" },
    });
    await tx.teacherProfile.create({ data: { userId: teacher.id, walletBalance: 0 } });
    const center = await tx.center.create({
      data: { name: tag + "-c", shortId: ("C" + rid() + rid()).slice(0, 12).toUpperCase(), status: "active", walletBalance: 0 },
    });
    await tx.centerTeacherAffiliation.create({
      data: { centerId: center.id, teacherId: teacher.id, status: "active", centerShare: 5000, expiresAt: new Date("2027-01-01T00:00:00Z") },
    });
    const course = await tx.course.create({
      data: { centerId: center.id, teacherId: teacher.id, title: tag, subject: "Math", daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date("2026-01-01T00:00:00Z"), price: 20000, maxStudents: 30, status: "active" },
    });
    const su = await tx.user.create({
      data: { name: tag + "-s", role: "student", email: tag + "-s@x.io", status: "active" },
    });
    await tx.studentProfile.create({
      data: { userId: su.id, fullName: tag + "-s", familyLinkCode: (tag + rid()).slice(0, 18), walletBalance: 0 },
    });
    await tx.enrollment.create({ data: { studentId: su.id, courseId: course.id, centerId: center.id, status: "active", enrolledBy: teacher.id } });
    const s1 = await tx.session.create({
      data: { courseId: course.id, teacherId: teacher.id, originalDate: new Date("2026-02-02T10:00:00Z"), date: new Date("2026-02-02T10:00:00Z"), startTime: "10:00", endTime: "11:00", status: "scheduled" },
    });
    await tx.attendanceRecord.create({ data: { sessionId: s1.id, studentId: su.id, courseId: course.id, centerId: center.id, status: "present", markedBy: teacher.id } });
    return { teacher: teacher.id, student: su.id, session: s1.id };
  });
  await completeSession(fx.session, { id: fx.teacher, role: "teacher" } as SessionUser);
  return fx;
}
const walletOf = (studentId: string) =>
  withPlatformContext(async (tx) => {
    const p = await tx.studentProfile.findUnique({ where: { userId: studentId }, select: { walletBalance: true } });
    return p!.walletBalance;
  });
const walletRefundRows = (studentId: string) =>
  withPlatformContext((tx) => tx.walletLedger.count({ where: { studentId, type: "refund" } }));

async function main() {
  const tag = "wref-" + rid();
  __sweepTag = tag;
  console.log("Wallet refund proof —", tag);
  const su = { id: tag + "-su", role: "super_admin" } as SessionUser;
  const suId = await withPlatformContext((tx) =>
    tx.user.create({ data: { name: tag + "-su", role: "super_admin", email: tag + "-su@x.io", status: "active" } }).then((u) => u.id),
  );
  (su as { id: string }).id = suId;

  const a = await buildDistributedLesson(tag + "a");
  const before = await walletOf(a.student);
  const out = await refundLessonForStudent(a.session, a.student, "duplicate charge", su);
  const after = await walletOf(a.student);
  assert(before === 0, "wallet starts at 0");
  assert((out as { refunded: number }).refunded === 20000, `refund amount = originally-charged 20000 (got ${(out as { refunded: number }).refunded})`);
  assert(after === 20000, `wallet credited the originally-charged amount (0 -> ${after})`);
  assert((await walletRefundRows(a.student)) === 1, "exactly ONE wallet refund ledger row");

  const b = await buildDistributedLesson(tag + "b");
  const results = await Promise.allSettled([
    refundLessonForStudent(b.session, b.student, "double", su),
    refundLessonForStudent(b.session, b.student, "double", su),
  ]);
  const okCount = results.filter((r) => r.status === "fulfilled").length;
  const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  const bWallet = await walletOf(b.student);
  const bRows = await walletRefundRows(b.student);
  assert(okCount === 1, `exactly ONE concurrent refund succeeded (got ${okCount})`);
  assert(
    rejected.length === 1 && String(rejected[0].reason?.message ?? rejected[0].reason).toLowerCase().includes("already"),
    "the other was rejected ('already refunded')",
  );
  assert(bWallet === 20000, `wallet credited EXACTLY ONCE under the race (got ${bWallet}, not 40000)`);
  assert(bRows === 1, `exactly ONE wallet refund ledger row under the race (got ${bRows})`);

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
