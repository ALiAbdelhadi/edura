import { withPlatformContext } from "@repo/database";
import { completeSession } from "@repo/server-core/services/finance/distribution";
import { bulkMarkAttendance } from "@repo/server-core/services/attendance/attendance";
import { proposeAgreement } from "@repo/server-core/services/finance/agreements";
import {
  approveAgreement,
  rejectAgreement,
  terminateAgreement,
} from "@repo/server-core/backoffice/admin/teacher-agreements-admin";
import { refundLessonForStudent } from "@repo/server-core/backoffice/finance/refunds";
import { BusinessRuleError } from "@repo/server-core/errors/classes";
import type { SessionUser } from "@repo/server-core/auth/types";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "agreement-refund-mirror.test.ts";

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

async function caught(fn: () => Promise<unknown>): Promise<unknown | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}

async function main() {
  const tag = "arm5-" + rid();
  __sweepTag = tag;
  console.log("Agreement approval + refund mirror DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({
      data: { name: `${tag}-teacher`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
    await tx.teacherProfile.create({ data: { userId: teacher.id, walletBalance: 0 } });
    const owner = await tx.user.create({
      data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" },
    });
    const admin = await tx.user.create({
      data: { name: `${tag}-admin`, role: "super_admin", email: `${tag}-a@x.io`, status: "active" },
    });
    const center = await tx.center.create({
      data: {
        name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18),
        status: "active", ownerUserId: owner.id, walletBalance: 0, creditBalance: 0,
      },
    });
    await tx.centerTeacherAffiliation.create({
      data: {
        centerId: center.id, teacherId: teacher.id, status: "active", centerShare: 1000,
        expiresAt: new Date(Date.now() + 30 * DAY),
      },
    });
    const course = await tx.course.create({
      data: {
        centerId: center.id, teacherId: teacher.id, title: `${tag}-c`, subject: "Math",
        daysOfWeek: [1], startTime: "10:00", endTime: "11:00",
        startDate: new Date(Date.now() - 30 * DAY),
        maxStudents: 30, status: "active", price: 0, pricePerSession: 10000,
        settlementBasis: "session_price",
      },
    });
    const stu = await tx.user.create({
      data: { name: `${tag}-stu`, role: "student", email: `${tag}-s@x.io`, status: "active" },
    });
    await tx.studentProfile.create({
      data: { userId: stu.id, fullName: `${tag}-stu`, familyLinkCode: `${tag.toUpperCase()}F0` },
    });
    await tx.enrollment.create({
      data: { studentId: stu.id, courseId: course.id, centerId: center.id, status: "active", enrolledBy: teacher.id },
    });
    const session = await tx.session.create({
      data: {
        courseId: course.id, teacherId: teacher.id,
        originalDate: new Date(), date: new Date(),
        startTime: "10:00", endTime: "11:00", status: "scheduled",
      },
    });
    await tx.subscription.create({
      data: {
        studentId: stu.id, targetType: "center", teacherId: teacher.id, centerId: center.id,
        courseId: course.id, sessionId: session.id, plan: "per_session", price: 10000,
        paymentMethod: "online_paymob", status: "active", source: "online", activatedAt: new Date(),
      },
    });
    return {
      teacher: teacher.id, owner: owner.id, admin: admin.id, center: center.id,
      course: course.id, student: stu.id, session: session.id,
    };
  });

  const owner = { id: fx.owner, role: "center_admin", centerId: fx.center } as unknown as SessionUser;
  const adminUser = { id: fx.admin, role: "super_admin" } as unknown as SessionUser;
  const teacherUser = { id: fx.teacher, role: "teacher" } as unknown as SessionUser;

  console.log("\n[1] approval activates in one tx, supersession ends the old row");
  const p1 = await proposeAgreement(
    { teacherId: fx.teacher, basis: "percent_of_net", rateBp: 6000, residual: "center" },
    owner,
  );
  const a1 = await approveAgreement(p1.id, adminUser, new Date(Date.now() - 2 * DAY).toISOString());
  assert(a1.status === "active" && a1.approvedBy === fx.admin, "proposal → active with the approver recorded");

  const p2 = await proposeAgreement(
    { teacherId: fx.teacher, basis: "fixed_per_student", rateFlat: 4000, residual: "center" },
    owner,
  );
  const a2 = await approveAgreement(p2.id, adminUser, new Date(Date.now() - 1 * DAY).toISOString());
  const rows = await withPlatformContext((tx) =>
    tx.teacherAgreement.findMany({
      where: { centerId: fx.center, teacherId: fx.teacher },
      orderBy: { createdAt: "asc" },
      select: { id: true, status: true, endedAt: true },
    }),
  );
  const first = rows.find((r) => r.id === a1.id);
  assert(
    first?.status === "ended" && first?.endedAt?.getTime() === a2.effectiveFrom?.getTime(),
    "the superseded row ended exactly at the new row's effectiveFrom",
  );
  assert(
    rows.filter((r) => r.status === "active").length === 1,
    "exactly ONE active row per pair (the partial unique's invariant)",
  );
  const audits = await withPlatformContext((tx) =>
    tx.auditLog.count({ where: { action: "teacher_agreement.approved", actorId: fx.admin } }),
  );
  assert(audits >= 2, "each approval wrote its audit row");

  console.log("\n[2] reject / terminate guards");
  assert(
    (await caught(() => rejectAgreement(a2.id, adminUser))) instanceof BusinessRuleError,
    "an ACTIVE agreement cannot be 'rejected'",
  );
  assert(
    (await caught(() => terminateAgreement(a1.id, adminUser))) instanceof BusinessRuleError,
    "an ENDED agreement cannot be terminated again",
  );

  console.log("\n[3] the refund mirror — reversal under the lesson-date agreement");
  await bulkMarkAttendance(fx.session, [{ studentId: fx.student, status: "present" }], fx.owner, fx.center);
  await completeSession(fx.session, teacherUser);
  const st = (await withPlatformContext((tx) =>
    tx.sessionSettlement.findUnique({ where: { sessionId: fx.session } }),
  ))!;
  assert(
    st.teacherTotal === 4000 && st.centerTotal === 5600,
    `settled under the LIVE agreement (${st.teacherTotal}/${st.centerTotal})`,
  );
  await refundLessonForStudent(fx.session, fx.student, "mirror proof", {
    id: fx.admin,
    role: "accountant",
  } as never);
  const after = await withPlatformContext(async (tx) => ({
    teacher: (await tx.teacherProfile.findUnique({ where: { userId: fx.teacher }, select: { walletBalance: true } }))!.walletBalance,
    center: (await tx.center.findUnique({ where: { id: fx.center }, select: { walletBalance: true } }))!.walletBalance,
    student: (await tx.studentProfile.findUnique({ where: { userId: fx.student }, select: { walletBalance: true } }))!.walletBalance,
  }));
  assert(
    after.teacher === 0 && after.center === 0,
    "both wallets reversed EXACTLY to zero — one derivation, settlement and refund",
  );
  assert(after.student === 10000, "the student was made whole");

  console.log("\n[2b] termination falls back to the affiliation");
  const ended = await terminateAgreement(a2.id, adminUser);
  assert(ended.status === "ended", "the live agreement ends on demand");

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
