// Registration proof — the four public sign-up doors (student, parent,
// teacher, center) against the live DB, plus the login door they hand off to.
//
// What this pins down:
//
//   1. TEACHER is a real door now. It creates a `pending` user + a
//      TeacherProfile, which is exactly the shape apps/superadmin's
//      approveTeacher() already required (it rejects anything not `pending`)
//      but that nothing could produce until now.
//   2. PENDING accounts (teacher + center admin) are REJECTED by the www login
//      door. This is not a regression — it is why the register page must show
//      "awaiting review" instead of auto-signing in and bouncing to /login,
//      which is what made center registration look broken.
//   3. ACTIVE accounts (student + parent) sign in immediately, so the
//      auto-signIn path is still correct for them.
//   4. Once approved (status → active) the teacher signs in normally.
//   5. The API's error envelope carries a MACHINE-READABLE reason for every
//      rejection — `fields` for validation, code `conflict` for duplicates.
//      The register page had been discarding all of it (ky >= 2 consumes the
//      body into `error.data`, so the old `err.response.json()` always threw),
//      so every failure surfaced as the generic "Registration failed".
//
// Nothing is mocked: the real register services, the real zod route schemas,
// and the real better-auth /sign-in/email pipeline (before-hooks + credential
// verify + session issuance) all run, via the shared auth-door helper.
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { prisma } from "@repo/database";
import { passwordSchema, phoneSchema } from "@repo/server-core/validation/common";
import {
  registerStudent,
  registerParent,
  registerTeacher,
  registerCenter,
} from "@/lib/services/auth/register";
import { signInDoor } from "./helpers/auth-door";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
neonConfig.webSocketConstructor = ws as never;
const admin = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });

const PW = "Passw0rd!Reg1";

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

// The real login door — the same /sign-in/email pipeline /login and the
// register page's auto-signIn both go through. signInDoor mints a fresh IP
// per call so the C2 per-IP bucket never starves this suite; the per-email
// bucket (cap 5) is what the negative cases spend, and no email here is
// tried more than twice.
const login = (email: string, password: string) => signInDoor(email, password);

async function main() {
  const tag = "reg-" + Math.floor(Math.random() * 1e9).toString(36);
  const emailStudent = `${tag}-student@x.io`;
  const emailParent = `${tag}-parent@x.io`;
  const emailTeacher = `${tag}-teacher@x.io`;
  const emailCenter = `${tag}-center@x.io`;

  const userIds: string[] = [];
  const centerIds: string[] = [];

  try {
    console.log("Registration doors —", tag);

    // ------------------------------------------- 1) the four doors all open
    const student = await registerStudent({ email: emailStudent, password: PW, name: "S", locale: "ar" });
    const parent = await registerParent({ email: emailParent, password: PW, name: "P", locale: "ar" });
    const teacher = await registerTeacher({ email: emailTeacher, password: PW, name: "T", locale: "ar" });
    const center = await registerCenter({
      admin: { email: emailCenter, password: PW, name: "CA", locale: "ar" },
      center: { name: `${tag} Center` },
    });
    userIds.push(student.userId, parent.userId, teacher.userId, center.userId);
    centerIds.push(center.centerId);

    assert(student.user.role === "student" && student.user.status === "active", "student registers ACTIVE");
    assert(parent.user.role === "parent" && parent.user.status === "active", "parent registers ACTIVE");
    assert(teacher.user.role === "teacher" && teacher.user.status === "pending", "teacher registers PENDING (needs approval)");

    const centerAdmin = (
      await admin.query(`SELECT role, status FROM users WHERE id=$1`, [center.userId])
    ).rows[0] as { role: string; status: string };
    assert(
      centerAdmin.role === "center_admin" && centerAdmin.status === "pending",
      "center admin registers PENDING (needs approval)",
    );

    // ------------------------- 2) teacher gets the profile the portal needs
    const profile = (
      await admin.query(`SELECT id, onboarding_completed FROM teacher_profiles WHERE user_id=$1`, [
        teacher.userId,
      ])
    ).rows[0] as { id: string; onboarding_completed: boolean } | undefined;
    assert(!!profile, "teacher registration creates the TeacherProfile row");
    assert(
      profile?.onboarding_completed === false,
      "the new teacher starts un-onboarded, so the existing wizard picks them up",
    );

    // ---- 3) the login door: ACTIVE roles in, PENDING roles out (unchanged)
    const inStudent = await login(emailStudent, PW);
    assert(
      inStudent.ok && (inStudent.user.id as string) === student.userId,
      "student can sign in right after registering",
    );
    const inParent = await login(emailParent, PW);
    assert(
      inParent.ok && (inParent.user.id as string) === parent.userId,
      "parent can sign in right after registering",
    );
    const inTeacherPending = await login(emailTeacher, PW);
    assert(
      !inTeacherPending.ok && inTeacherPending.message === "ACCOUNT_INACTIVE",
      "PENDING teacher is refused by the login door — auto-signIn could never work",
    );
    const inCenterPending = await login(emailCenter, PW);
    assert(
      !inCenterPending.ok && inCenterPending.message === "ACCOUNT_INACTIVE",
      "PENDING center admin is refused by the login door — the dead-end the UI now explains",
    );

    // ------------------------------ 4) approval is the only thing missing
    await admin.query(`UPDATE users SET status='active' WHERE id=$1`, [teacher.userId]);
    const inTeacherApproved = await login(emailTeacher, PW);
    assert(
      inTeacherApproved.ok && (inTeacherApproved.user.id as string) === teacher.userId,
      "once a super_admin approves (status → active) the teacher signs in normally",
    );

    // --------- 5) failures carry a machine-readable reason the UI can show
    const weak = passwordSchema.safeParse("mypasswordhere");
    assert(
      !weak.success && weak.error.issues.some((i) => /digit/i.test(i.message)),
      "a letters-only password is rejected WITH a reason (client zod now mirrors this)",
    );
    assert(
      !phoneSchema.safeParse("12345").success && phoneSchema.safeParse("01001234567").success,
      "phone must be an Egyptian number (client zod now mirrors this)",
    );

    let conflictCode: string | undefined;
    try {
      await registerParent({ email: emailParent, password: PW, name: "P again", locale: "ar" });
    } catch (err) {
      conflictCode = (err as { code?: string }).code;
    }
    assert(
      conflictCode === "conflict",
      "re-registering an existing email throws a `conflict` the UI can translate",
    );

    let teacherConflict: string | undefined;
    try {
      await registerTeacher({ email: emailTeacher, password: PW, name: "T again", locale: "ar" });
    } catch (err) {
      teacherConflict = (err as { code?: string }).code;
    }
    assert(teacherConflict === "conflict", "the teacher door enforces the same uniqueness rule");

    // ------------------------------------- 6) no weakening of the guards
    const wrongPw = await login(emailStudent, "WrongPassword1");
    assert(
      !wrongPw.ok && wrongPw.message === "Invalid email or password",
      "guard intact: wrong password still fails (generic message, no enumeration)",
    );
    const nobody = await login(`${tag}-nobody@x.io`, PW);
    assert(!nobody.ok, "guard intact: unknown email still fails");
  } finally {
    await admin.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [userIds]);
    await admin.query(`DELETE FROM teacher_profiles WHERE user_id = ANY($1::uuid[])`, [userIds]);
    await admin.query(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [userIds]);
    await admin.query(`DELETE FROM parent_profiles WHERE user_id = ANY($1::uuid[])`, [userIds]);
    await admin.query(`DELETE FROM center_admin_profiles WHERE user_id = ANY($1::uuid[])`, [userIds]);
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
    await admin.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [centerIds]);
    await admin.end();
    await prisma.$disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

// The environment guard runs BEFORE main(), so invoking this file directly
// (which bypasses the `pretest:db` step) cannot write to dev or production.
assertDbEnv(["test"], { intent: "suite registration-doors.test.ts" })
  .then(() => main()).catch((e) => {
  console.error(e);
  process.exit(1);
});
