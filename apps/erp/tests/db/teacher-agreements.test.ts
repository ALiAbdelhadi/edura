import { withPlatformContext } from "@repo/database";
import { completeSession } from "@repo/server-core/services/finance/distribution";
import { bulkMarkAttendance } from "@repo/server-core/services/attendance/attendance";
import {
  proposeAgreement,
  approveAgreementTx,
} from "@repo/server-core/services/finance/agreements";
import { BusinessRuleError } from "@repo/server-core/errors/classes";
import type { SessionUser } from "@repo/server-core/auth/types";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "teacher-agreements.test.ts";

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
  const tag = "tag5-" + rid();
  __sweepTag = tag;
  console.log("Teacher agreements DB tests —", tag);

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
    await tx.centerAdminProfile.create({ data: { userId: owner.id, centerId: center.id } });
    await tx.centerTeacherAffiliation.create({
      data: {
        centerId: center.id, teacherId: teacher.id, status: "active", centerShare: 1000,
        expiresAt: new Date(Date.now() + 30 * DAY),
      },
    });
    const mkCourse = (extra: Record<string, unknown> = {}) =>
      tx.course.create({
        data: {
          centerId: center.id, teacherId: teacher.id, title: `${tag}-c${Object.keys(extra).length}`,
          subject: "Math", daysOfWeek: [1], startTime: "10:00", endTime: "11:00",
          startDate: new Date(Date.now() - 30 * DAY),
          maxStudents: 30, status: "active", price: 0, pricePerSession: 10000,
          settlementBasis: "session_price", ...extra,
        },
      });
    const course = await mkCourse();
    const roomCourse = await mkCourse({
      pricingMethod: "whole_room_percent",
      splitPlatformBp: 2000, splitTeacherBp: 6000, splitCenterBp: 2000,
    });
    const students: string[] = [];
    for (let i = 0; i < 2; i++) {
      const stu = await tx.user.create({
        data: { name: `${tag}-stu${i}`, role: "student", email: `${tag}-s${i}@x.io`, status: "active" },
      });
      students.push(stu.id);
      await tx.studentProfile.create({
        data: { userId: stu.id, fullName: `${tag}-stu${i}`, familyLinkCode: `${tag.toUpperCase()}F${i}` },
      });
      for (const c of [course, roomCourse]) {
        await tx.enrollment.create({
          data: { studentId: stu.id, courseId: c.id, centerId: center.id, status: "active", enrolledBy: teacher.id },
        });
      }
    }
    const mkSession = async (courseId: string, when: Date) => {
      const sess = await tx.session.create({
        data: {
          courseId, teacherId: teacher.id, originalDate: when, date: when,
          startTime: "10:00", endTime: "11:00", status: "scheduled",
        },
      });
      for (const stu of students) {
        await tx.subscription.create({
          data: {
            studentId: stu, targetType: "center", teacherId: teacher.id, centerId: center.id,
            courseId, sessionId: sess.id, plan: "per_session", price: 10000,
            paymentMethod: "online_paymob", status: "active", source: "online", activatedAt: new Date(),
          },
        });
      }
      return sess.id;
    };
    const now = new Date();
    const sBaseline = await mkSession(course.id, now);
    const sPercent = await mkSession(course.id, now);
    const sOld = await mkSession(course.id, new Date(Date.now() - 1 * DAY)); // dated under agreement #1
    const sFixed = await mkSession(course.id, now);
    const sTeacherRes = await mkSession(course.id, now);
    const sRoom = await mkSession(roomCourse.id, now);
    return {
      teacher: teacher.id, owner: owner.id, admin: admin.id, center: center.id,
      course: course.id, roomCourse: roomCourse.id, students,
      sBaseline, sPercent, sOld, sFixed, sTeacherRes, sRoom,
    };
  });

  const owner = { id: fx.owner, role: "center_admin", centerId: fx.center } as unknown as SessionUser;
  const teacherUser = { id: fx.teacher, role: "teacher" } as unknown as SessionUser;

  const mark2 = (sessionId: string) =>
    bulkMarkAttendance(
      sessionId,
      fx.students.map((studentId) => ({ studentId, status: "present" as const })),
      fx.owner,
      fx.center,
    );
  const settle = async (sessionId: string) => {
    await mark2(sessionId);
    await completeSession(sessionId, teacherUser);
    return (await withPlatformContext((tx) =>
      tx.sessionSettlement.findUnique({ where: { sessionId } }),
    ))!;
  };
  const conserves = (st: { teacherTotal: number; centerTotal: number; platformTotal: number }, gross: number) =>
    st.teacherTotal + st.centerTotal + st.platformTotal === gross;

  console.log("\n[8] proposal-shape refusals");
  assert(
    (await caught(() =>
      proposeAgreement({ teacherId: fx.teacher, basis: "percent_of_net", rateFlat: 5000 }, owner),
    )) instanceof BusinessRuleError,
    "percent basis with a flat rate is refused",
  );
  assert(
    (await caught(() =>
      proposeAgreement({ teacherId: fx.teacher, basis: "fixed_per_student", rateBp: 5000 }, owner),
    )) instanceof BusinessRuleError,
    "fixed basis with a bp rate is refused",
  );

  console.log("\n[1] a proposal has NO force (D2)");
  const proposal = await proposeAgreement(
    { teacherId: fx.teacher, basis: "percent_of_net", rateBp: 6000, residual: "center" },
    owner,
  );
  assert(proposal.status === "proposed", "the ERP writes a PROPOSAL");
  assert(
    (await caught(() =>
      proposeAgreement({ teacherId: fx.teacher, basis: "percent_of_net", rateBp: 5000 }, owner),
    )) instanceof BusinessRuleError,
    "[8] a second pending proposal for the pair is refused",
  );
  const stBaseline = await settle(fx.sBaseline);
  assert(
    stBaseline.teacherTotal === 17600 && stBaseline.centerTotal === 1600,
    `pending proposal changed nothing — affiliation math held (${stBaseline.teacherTotal}/${stBaseline.centerTotal})`,
  );

  console.log("\n[2] percent_of_net, residual=center — the spec's 60% teacher");
  await withPlatformContext((tx) =>
    approveAgreementTx(tx, proposal.id, fx.admin, new Date(Date.now() - 2 * DAY)),
  );
  const stPercent = await settle(fx.sPercent);
  assert(
    stPercent.teacherTotal === 11520 && stPercent.centerTotal === 7680 && stPercent.platformTotal === 800,
    `teacher 60% of net, center the remainder (${stPercent.teacherTotal}/${stPercent.centerTotal}/${stPercent.platformTotal})`,
  );
  assert(conserves(stPercent, 20000), "[7] conserves to the gross");

  console.log("\n[3] fixed_per_student, residual=center — 50 EGP/student to the teacher");
  const fixedProposal = await proposeAgreement(
    { teacherId: fx.teacher, basis: "fixed_per_student", rateFlat: 5000, residual: "center" },
    owner,
  );
  await withPlatformContext((tx) =>
    approveAgreementTx(tx, fixedProposal.id, fx.admin, new Date(Date.now() - 60 * 60 * 1000)),
  );
  const stFixed = await settle(fx.sFixed);
  assert(
    stFixed.teacherTotal === 10000 && stFixed.centerTotal === 9200,
    `teacher 50 EGP/student, center the remainder (${stFixed.teacherTotal}/${stFixed.centerTotal})`,
  );
  assert(conserves(stFixed, 20000), "[7] conserves to the gross");

  console.log("\n[5] effective dating — the lesson's date governs, not today");
  const stOld = await settle(fx.sOld);
  assert(
    stOld.teacherTotal === 11520 && stOld.centerTotal === 7680,
    `a lesson dated under agreement #1 settles under #1 even after #2 activated (${stOld.teacherTotal}/${stOld.centerTotal})`,
  );

  console.log("\n[4] percent_of_net, residual=teacher — today's direction, contracted");
  const teacherResProposal = await proposeAgreement(
    { teacherId: fx.teacher, basis: "percent_of_net", rateBp: 3000, residual: "teacher" },
    owner,
  );
  await withPlatformContext((tx) =>
    approveAgreementTx(tx, teacherResProposal.id, fx.admin, new Date(Date.now() - 30 * 60 * 1000)),
  );
  const stTeacherRes = await settle(fx.sTeacherRes);
  assert(
    stTeacherRes.teacherTotal === 13840 && stTeacherRes.centerTotal === 5360,
    `the rate prices the center's share; the teacher keeps the remainder (${stTeacherRes.teacherTotal}/${stTeacherRes.centerTotal})`,
  );
  assert(conserves(stTeacherRes, 20000), "[7] conserves to the gross");

  console.log("\n[6] precedence — a room-based course ignores the agreement");
  const stRoom = await settle(fx.sRoom);
  assert(
    stRoom.teacherTotal === 12000 && stRoom.centerTotal === 4000 && stRoom.platformTotal === 4000,
    `the frozen room split governed (${stRoom.teacherTotal}/${stRoom.centerTotal}/${stRoom.platformTotal}) — ONE rule per course`,
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
