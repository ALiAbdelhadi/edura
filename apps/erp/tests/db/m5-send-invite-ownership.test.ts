import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext, prisma } from "@repo/database";
import { sendTempStudentInvite } from "@/lib/services/temp-students/temp-students";
import type { SessionUser } from "@/lib/auth/session";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗", m)); };

const centerActor = (centerId: string): SessionUser =>
  ({ id: "irrelevant-" + centerId, role: "center_admin", centerId, locale: "en" });
const teacherActor = (id: string): SessionUser => ({ id, role: "teacher", locale: "en" });

async function expectRejected(actor: SessionUser, tempUserId: string, label: string) {
  try {
    const res = await sendTempStudentInvite(tempUserId, actor);
    fail++;
    console.error("  ✗", label, "— expected rejection but got:", JSON.stringify(res));
  } catch (e) {
    const status = (e as { status?: number }).status;
    const msg = (e as Error).message ?? "";
    ok(status === 404, `${label}: rejected 404 (got ${status})`);
    ok(!/inviteCode|INV-|@/.test(msg), `${label}: error body leaks no code/phone`);
  }
}

async function main() {
  const tag = "m5-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("M5 send-invite ownership —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const centerA = await tx.center.create({ data: { name: tag + "-A", shortId: (tag + "A").slice(0, 12).toUpperCase(), status: "active", walletBalance: 0 } });
    const centerB = await tx.center.create({ data: { name: tag + "-B", shortId: (tag + "B").slice(0, 12).toUpperCase(), status: "active", walletBalance: 0 } });

    const teacherT = await tx.user.create({ data: { name: tag + "-T", role: "teacher", email: tag + "-t@x.io", status: "active" } });
    const teacherR = await tx.user.create({ data: { name: tag + "-R", role: "teacher", email: tag + "-r@x.io", status: "active" } });

    const inviteCode = "INV-" + tag.toUpperCase();
    const shell = await tx.user.create({ data: { name: tag + "-shell", phone: "+2010" + tag.replace(/\D/g, "").slice(0, 8).padEnd(8, "0"), role: "student", status: "shell", passwordHash: null } });
    await tx.studentProfile.create({
      data: {
        userId: shell.id, fullName: tag + "-shell", phone: "+2010" + tag.replace(/\D/g, "").slice(0, 8).padEnd(8, "0"),
        familyLinkCode: (tag + "fam").slice(0, 18), entityType: "invited", inviteCode, pointsBalance: 0,
      },
    });

    await tx.centerStudentRoster.create({ data: { centerId: centerA.id, studentId: shell.id, addedAt: new Date() } });
    const courseT = await tx.course.create({
      data: {
        centerId: null, teacherId: teacherT.id, title: tag + "-cT", subject: "Math",
        daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date("2026-01-01T00:00:00Z"),
        maxStudents: 30, status: "active", price: 40000,
      },
    });
    await tx.enrollment.create({ data: { studentId: shell.id, courseId: courseT.id, centerId: null, status: "active", enrolledBy: teacherT.id } });

    const courseR = await tx.course.create({
      data: {
        centerId: null, teacherId: teacherR.id, title: tag + "-cR", subject: "Math",
        daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date("2026-01-01T00:00:00Z"),
        maxStudents: 30, status: "active", price: 40000,
      },
    });

    return { centerA: centerA.id, centerB: centerB.id, teacherT: teacherT.id, teacherR: teacherR.id, shell: shell.id, inviteCode, phone: shell.phone, courseT: courseT.id, courseR: courseR.id };
  });

  try {
    console.log("\n(1) rival CENTER B invites A's shell — must be rejected:");
    await expectRejected(centerActor(fx.centerB), fx.shell, "center B (not owner)");

    console.log("\n(2) owner CENTER A invites its own shell — must work:");
    const aRes = await sendTempStudentInvite(fx.shell, centerActor(fx.centerA));
    ok(aRes.inviteCode === fx.inviteCode, `center A: returns the real invite code`);
    ok(aRes.phone === fx.phone, `center A: returns the phone`);

    console.log("\n(3) rival TEACHER R invites a shell not enrolled with R — must be rejected:");
    await expectRejected(teacherActor(fx.teacherR), fx.shell, "teacher R (not owner)");

    console.log("\n(4) owner TEACHER T invites its enrolled shell — must work (= assistant-of-T scope):");
    const tRes = await sendTempStudentInvite(fx.shell, teacherActor(fx.teacherT));
    ok(tRes.inviteCode === fx.inviteCode, `teacher T: returns the real invite code`);
    ok(tRes.phone === fx.phone, `teacher T: returns the phone`);

    console.log("\n(5) center_admin with NO centerId — default-closed rejection:");
    await expectRejected({ id: "x", role: "center_admin", locale: "en" }, fx.shell, "center_admin sans centerId");
  } finally {
    const c = await admin.connect();
    try {
      await c.query(`DELETE FROM enrollments WHERE course_id = ANY($1::uuid[])`, [[fx.courseT, fx.courseR]]);
      await c.query(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [[fx.courseT, fx.courseR]]);
      await c.query(`DELETE FROM center_student_rosters WHERE student_id = $1`, [fx.shell]);
      await c.query(`DELETE FROM student_profiles WHERE user_id = $1`, [fx.shell]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[fx.shell, fx.teacherT, fx.teacherR]]);
      await c.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [[fx.centerA, fx.centerB]]);
    } finally {
      c.release();
      await admin.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite m5-send-invite-ownership.test.ts" })
  .then(() => main()).catch((e) => { console.error(e); process.exit(1); });
