import { testPool } from "../../../../packages/database/scripts/test-pool";
import { prisma, withPlatformContext } from "@repo/database";
import { sendTempStudentInvite } from "@repo/server-core/services/temp-students/temp-students";
import type { SessionUser } from "@/lib/auth/session";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗", m)); };

const tag = "tsi-" + Math.floor(Math.random() * 1e9).toString(36);
const seed = Math.floor(Math.random() * 1e9);
const phoneOf = (i: number) => `+2010${String(seed).padStart(9, "0").slice(0, 6)}${String(i).padStart(2, "0")}`;

const centerActor = (id: string, centerId: string) =>
  ({ id, role: "center_admin", centerId, locale: "en" }) as SessionUser;
const teacherActor = (id: string) =>
  ({ id, role: "teacher", locale: "en" }) as SessionUser;

async function refusal(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "<<SUCCEEDED>>";
  } catch (e) {
    return (e as Error).message ?? "";
  }
}

async function main() {
  console.log("Temp-student invite ownership (M5) —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const mkCenter = (n: string) =>
      tx.center.create({
        data: { name: `${tag}-${n}`, shortId: (tag + n).slice(0, 12).toUpperCase(), status: "active", walletBalance: 0, isDemo: true },
      });
    const centerA = await mkCenter("A");
    const centerB = await mkCenter("B");

    const mkUser = (label: string, role: string) =>
      tx.user.create({
        data: { name: `${tag}-${label}`, role: role as "teacher", email: `${tag}-${label}@x.io`, status: "active", isDemo: true },
      });
    const adminA = await mkUser("adminA", "center_admin");
    const adminB = await mkUser("adminB", "center_admin");
    const teacherOwn = await mkUser("teacherOwn", "teacher");
    const teacherOther = await mkUser("teacherOther", "teacher");

    // three temp students, identical but for how they are held
    const mkTemp = async (n: number, label: string) => {
      const u = await tx.user.create({
        data: { name: `${tag}-${label}`, phone: phoneOf(n), role: "student", status: "shell", passwordHash: null, isDemo: true },
      });
      await tx.studentProfile.create({
        data: {
          userId: u.id, fullName: `${tag}-${label}`, phone: phoneOf(n),
          entityType: "invited", inviteCode: (tag + label).toUpperCase().slice(0, 18),
          familyLinkCode: (tag + "F" + n).toUpperCase().slice(0, 18),
        },
      });
      return u.id;
    };
    const held = await mkTemp(1, "held");
    const departed = await mkTemp(2, "departed");
    const enrolled = await mkTemp(3, "enrolled");
    const dropped = await mkTemp(4, "dropped");

    await tx.centerStudentRoster.create({ data: { centerId: centerA.id, studentId: held } });
    await tx.centerStudentRoster.create({
      data: { centerId: centerA.id, studentId: departed, leftAt: new Date() },
    });

    const course = await tx.course.create({
      data: {
        centerId: centerA.id, teacherId: teacherOwn.id, title: `${tag}-course`, subject: "Math",
        daysOfWeek: [1], startTime: "10:00", endTime: "11:00",
        startDate: new Date("2026-01-01T00:00:00Z"), maxStudents: 30, status: "active", price: 40000,
      },
    });
    await tx.enrollment.create({
      data: { studentId: enrolled, courseId: course.id, centerId: centerA.id, status: "active", enrolledBy: teacherOwn.id },
    });
    await tx.enrollment.create({
      data: { studentId: dropped, courseId: course.id, centerId: centerA.id, status: "unenrolled", enrolledBy: teacherOwn.id },
    });

    return {
      centerA: centerA.id, centerB: centerB.id, adminA: adminA.id, adminB: adminB.id,
      teacherOwn: teacherOwn.id, teacherOther: teacherOther.id,
      held, departed, enrolled, dropped, course: course.id,
    };
  });

  const A = centerActor(fx.adminA, fx.centerA);
  const B = centerActor(fx.adminB, fx.centerB);

  try {
    console.log("\n[1] the centre that currently holds the temp student may send the code");
    const good = await sendTempStudentInvite(fx.held, A);
    ok(good.sent === true && !!good.inviteCode, "the holding centre gets the invite code");

    console.log("\n[2] another centre may not");
    const foreign = await refusal(() => sendTempStudentInvite(fx.held, B));
    ok(/Temp student not found/.test(foreign), `a foreign centre is refused (${foreign.slice(0, 40)})`);
    const unknown = await refusal(() =>
      sendTempStudentInvite("00000000-0000-4000-8000-000000000000", B),
    );
    ok(unknown === foreign, "…indistinguishably from an id that does not exist");

    console.log("\n[3] a centre the student has LEFT may not — membership must be current");
    const stillHasRow = await (async () => {
      const c = await admin.connect();
      try {
        const r = await c.query(
          `SELECT count(*)::int n FROM center_student_rosters WHERE center_id=$1 AND student_id=$2`,
          [fx.centerA, fx.departed],
        );
        return r.rows[0].n as number;
      } finally { c.release(); }
    })();
    ok(stillHasRow === 1, "the departed student still HAS a roster row — only leftAt separates them");
    const left = await refusal(() => sendTempStudentInvite(fx.departed, A));
    ok(/Temp student not found/.test(left), `sending their invite code is refused (${left.slice(0, 40)})`);

    console.log("\n[4] a teacher reaches only a student currently enrolled on their own course");
    const mine = await sendTempStudentInvite(fx.enrolled, teacherActor(fx.teacherOwn));
    ok(mine.sent === true, "the course's own teacher may send the code");
    const other = await refusal(() =>
      sendTempStudentInvite(fx.enrolled, teacherActor(fx.teacherOther)),
    );
    ok(/Temp student not found/.test(other), `an unrelated teacher is refused (${other.slice(0, 40)})`);
    const unenrolled = await refusal(() =>
      sendTempStudentInvite(fx.dropped, teacherActor(fx.teacherOwn)),
    );
    ok(
      /Temp student not found/.test(unenrolled),
      `an UNENROLLED student is refused even to their old teacher (${unenrolled.slice(0, 40)})`,
    );
  } finally {
    const users = [fx.adminA, fx.adminB, fx.teacherOwn, fx.teacherOther, fx.held, fx.departed, fx.enrolled, fx.dropped];
    const c = await admin.connect();
    try {
      await c.query(`DELETE FROM enrollments WHERE student_id = ANY($1::uuid[])`, [users]);
      await c.query(`DELETE FROM courses WHERE id = $1`, [fx.course]);
      await c.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[]) OR target_id = ANY($1::uuid[])`, [users]);
      await c.query(`DELETE FROM center_student_rosters WHERE student_id = ANY($1::uuid[])`, [users]);
      await c.query(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [users]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [users]);
      await c.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [[fx.centerA, fx.centerB]]);
      const leftOver = await c.query(`SELECT count(*)::int n FROM users WHERE name LIKE $1`, [tag + "%"]);
      ok(leftOver.rows[0].n === 0, "teardown: every fixture row removed");
    } finally {
      c.release();
      await admin.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite temp-student-invite-ownership.test.ts" })
  .then(() => main()).catch((e) => { console.error(e); process.exit(1); });
