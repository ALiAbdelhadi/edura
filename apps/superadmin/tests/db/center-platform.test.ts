import { testPool } from "../../../../packages/database/scripts/test-pool";
import bcrypt from "bcryptjs";
import { prisma } from "@repo/database";
import {
  adminCenterDashboard,
  adminCenterReports,
  moveStudentBetweenCenters,
  forceLogoutUser,
  verifyStudentDateOfBirth,
  moveCourseBetweenCenters,
} from "@/lib/services/admin/center-platform";
import type { SessionUser } from "@/lib/auth/session";
import { sessionFor, signInDoor } from "./helpers/auth-door";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

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
function section(t: string) {
  console.log(`\n── ${t} ${"─".repeat(Math.max(0, 64 - t.length))}`);
}
async function rejects(fn: () => Promise<unknown>, expect: RegExp) {
  try {
    await fn();
    return { threw: false, matched: false, message: "(resolved — no error)" };
  } catch (e) {
    const message = (e as { message?: string })?.message ?? String(e);
    return { threw: true, matched: expect.test(message), message };
  }
}
const q = async (sql: string, p: unknown[] = []) => (await admin.query(sql, p)).rows;

async function main() {
  const tag = "plat-" + Math.floor(Math.random() * 1e9).toString(36);
  const hash = await bcrypt.hash("Passw0rd!PLAT", 10);
  const users: string[] = [];
  const centers: string[] = [];

  const mkUser = async (key: string, role: string) => {
    const id = (
      await q(
        `INSERT INTO users (email, role, name, status, password_hash, is_demo, updated_at)
         VALUES ($1,$2,$3,'active',$4,true,now()) RETURNING id`,
        [`${tag}-${key}@edura.test`, role, `${tag}-${key}`, hash],
      )
    )[0].id as string;
    users.push(id);
    return id;
  };
  const mkCenter = async (key: string) => {
    const id = (
      await q(
        `INSERT INTO centers (name, short_id, status, is_demo, updated_at)
         VALUES ($1,$2,'active',true,now()) RETURNING id`,
        [`${tag}-${key}`, `${tag}${key}`.toUpperCase().slice(0, 20)],
      )
    )[0].id as string;
    centers.push(id);
    return id;
  };
  const auditRows = (action: string, targetId: string, actorId: string) =>
    q(
      `SELECT * FROM audit_logs WHERE action=$1 AND target_id=$2 AND actor_id=$3 ORDER BY created_at DESC`,
      [action, targetId, actorId],
    );

  try {
    console.log(`PHASE 5 — PLATFORM + REPORTS — ${tag}`);

    const superAdminId = await mkUser("super", "super_admin");
    const actor = { id: superAdminId, role: "super_admin" } as SessionUser;
    const centerA = await mkCenter("A");
    const centerB = await mkCenter("B");
    const teacher = await mkUser("teacher", "teacher");
    const student = await mkUser("student", "student");
    const staff = await mkUser("staff", "accountant");

    await q(
      `INSERT INTO center_teacher_affiliations (center_id, teacher_id, status, center_share, expires_at, updated_at)
       VALUES ($1,$2,'active',0, now() + interval '1 year', now())`,
      [centerA, teacher],
    );
    await q(
      `INSERT INTO student_profiles (user_id, full_name, family_link_code, updated_at) VALUES ($1,$2,$3,now())`,
      [student, `${tag}-s`, `${tag}`.toUpperCase().replace(/-/g, "").slice(0, 12)],
    );
    await q(`INSERT INTO center_student_rosters (center_id, student_id, updated_at) VALUES ($1,$2,now())`, [centerA, student]);

    const courseId = (
      await q(
        `INSERT INTO courses (center_id, teacher_id, title, subject, days_of_week, start_time, end_time,
           start_date, price, price_per_month, max_students, status, is_demo, updated_at)
         VALUES ($1,$2,$3,$3,'{1}','16:00','18:00', now(), 60000, 60000, 30, 'active', true, now())
         RETURNING id`,
        [centerA, teacher, `${tag}-course`],
      )
    )[0].id as string;

    await q(
      `INSERT INTO enrollments (student_id, course_id, center_id, status, enrolled_by, updated_at)
       VALUES ($1,$2,$3,'active',$4,now())`,
      [student, courseId, centerA, superAdminId],
    );
    await q(
      `INSERT INTO payments (center_id, student_id, amount, receipt_number, recorded_by, updated_at)
       VALUES ($1,$2,50000,$3,$4,now())`,
      [centerA, student, `RCP-${tag}-1`, superAdminId],
    );

    section("Reports — read the center's own reporting");
    const dash = await adminCenterDashboard(actor, centerA);
    assert(!!dash, "the center dashboard is readable for any center");

    for (const r of [
      "revenue",
      "net-profit",
      "expenses",
      "course-fill-rates",
      "attendance-by-course",
      "enrollment-funnel",
    ]) {
      const out = await adminCenterReports(actor, centerA, r, {});
      assert(out !== undefined && out !== null, `report '${r}' resolves`);
    }
    const unknown = await rejects(
      () => adminCenterReports(actor, centerA, "not-a-report", {}),
      /Unknown report/i,
    );
    assert(unknown.threw && unknown.matched, "an unknown report name is a 404, not a fall-through");

    section("Move a student between centers — ROSTER ONLY");
    const noReason = await rejects(
      () =>
        moveStudentBetweenCenters(actor, {
          studentId: student,
          fromCenterId: centerA,
          toCenterId: centerB,
          reason: "  ",
        }),
      /reason is required/i,
    );
    assert(noReason.threw && noReason.matched, "a move without a reason is refused");

    const sameCenter = await rejects(
      () =>
        moveStudentBetweenCenters(actor, {
          studentId: student,
          fromCenterId: centerA,
          toCenterId: centerA,
          reason: "x",
        }),
      /same/i,
    );
    assert(sameCenter.threw && sameCenter.matched, "moving to the same center is refused");

    const enrBefore = await q(
      `SELECT id, center_id, status FROM enrollments WHERE student_id=$1 ORDER BY id`,
      [student],
    );
    const payBefore = await q(
      `SELECT id, center_id, amount FROM payments WHERE student_id=$1 ORDER BY id`,
      [student],
    );

    const moved = await moveStudentBetweenCenters(actor, {
      studentId: student,
      fromCenterId: centerA,
      toCenterId: centerB,
      reason: "Proof run",
    });

    const rosterA = (
      await q(`SELECT left_at FROM center_student_rosters WHERE center_id=$1 AND student_id=$2`, [centerA, student])
    )[0];
    const rosterB = (
      await q(`SELECT left_at FROM center_student_rosters WHERE center_id=$1 AND student_id=$2`, [centerB, student])
    )[0];
    assert(rosterA.left_at !== null, "the student LEFT the old center's roster");
    assert(!!rosterB && rosterB.left_at === null, "…and is ACTIVE on the new center's roster");

    assert(
      JSON.stringify(enrBefore) ===
        JSON.stringify(await q(`SELECT id, center_id, status FROM enrollments WHERE student_id=$1 ORDER BY id`, [student])),
      "LIMIT: enrollments did NOT move — they stayed at the old center, untouched",
    );
    assert(
      JSON.stringify(payBefore) ===
        JSON.stringify(await q(`SELECT id, center_id, amount FROM payments WHERE student_id=$1 ORDER BY id`, [student])),
      "LIMIT: payment history did NOT move — settled facts stay where they happened",
    );
    assert(
      moved.leftBehind.activeEnrollments === 1 && moved.leftBehind.payments === 1,
      "the operation REPORTS what it left behind rather than implying a clean move",
    );

    let rows = await auditRows("platform.student_moved_between_centers", student, superAdminId);
    assert(rows.length === 2, "audit: recorded against BOTH centers, so it shows in either log");
    assert(
      rows.every((r) => r.after_state?.movedRolesOnly !== true),
      "audit rows exist for the move",
    );
    assert(
      rows[0].after_state?.movedRosterOnly === true && rows[0].after_state?.moneyMoved === false,
      "audit: states the roster-only limit and that no money moved",
    );
    const centerIdsLogged = new Set(rows.map((r) => r.center_id));
    assert(
      centerIdsLogged.has(centerA) && centerIdsLogged.has(centerB),
      "audit: one row scoped to each center",
    );

    const twice = await rejects(
      () =>
        moveStudentBetweenCenters(actor, {
          studentId: student,
          fromCenterId: centerA,
          toCenterId: centerB,
          reason: "again",
        }),
      /not on the source|already on the destination/i,
    );
    assert(twice.threw && twice.matched, "moving again is refused — the source roster is gone");

    section("Force logout — epoch only, NOT a deactivation");
    const verBefore = Number((await q(`SELECT token_version FROM users WHERE id=$1`, [staff]))[0].token_version);

    const staffAuth = await signInDoor(`${tag}-staff@edura.test`, "Passw0rd!PLAT");
    assert(staffAuth.ok, "harness check: the accountant signs in through the full door");
    if (!staffAuth.ok) throw new Error("cannot continue without the accountant session");
    assert(
      (await sessionFor(staffAuth.cookie))?.userId === staff,
      "harness check: the account's CURRENT session is accepted before any bump",
    );

    const noWhy = await rejects(() => forceLogoutUser(actor, staff, "  "), /reason is required/i);
    assert(noWhy.threw && noWhy.matched, "a force-logout without a reason is refused");

    const out = await forceLogoutUser(actor, staff, "Proof run", centerA);
    const after = (await q(`SELECT token_version, status FROM users WHERE id=$1`, [staff]))[0];
    assert(Number(after.token_version) === verBefore + 1, "the session epoch is bumped by one");
    assert(out.tokenVersion === Number(after.token_version), "…and the service reports it");
    assert(
      after.status === "active",
      "LIMIT: the account's STATUS is unchanged — this is not a deactivation",
    );
    assert(
      (await sessionFor(staffAuth.cookie)) === null,
      "C-03 path: a session minted before the bump is rejected on the very next request",
    );
    const staffAuth2 = await signInDoor(`${tag}-staff@edura.test`, "Passw0rd!PLAT");
    assert(
      staffAuth2.ok && (await sessionFor(staffAuth2.cookie))?.userId === staff,
      "…while a fresh sign-in mints a session that IS accepted — they can sign right back in",
    );
    rows = await auditRows("platform.user_force_logged_out", staff, superAdminId);
    assert(
      rows.length === 1 &&
        rows[0].after_state?.statusChanged === false &&
        rows[0].after_state?.canSignInAgain === true,
      "audit: one row, stating this changed no status and they can return",
    );

    section("§3.4 — verifying a date of birth is a CHILD-SAFETY decision");
    const dobBefore = (
      await q(`SELECT date_of_birth, date_of_birth_verified_at FROM student_profiles WHERE user_id=$1`, [student])
    )[0];
    assert(
      dobBefore.date_of_birth === null && dobBefore.date_of_birth_verified_at === null,
      "default-minor: the student starts with no verified date of birth",
    );

    const noEvidence = await rejects(
      () =>
        verifyStudentDateOfBirth(actor, student, { dateOfBirth: "2000-01-01", reason: "  " }),
      /reason is required/i,
    );
    assert(noEvidence.threw && noEvidence.matched, "verifying without recording the evidence is refused");

    const future = await rejects(
      () =>
        verifyStudentDateOfBirth(actor, student, {
          dateOfBirth: "2999-01-01",
          reason: "x",
        }),
      /future/i,
    );
    assert(future.threw && future.matched, "a future date of birth is refused");

    const notSuper = await rejects(
      () =>
        verifyStudentDateOfBirth(
          { id: superAdminId, role: "center_admin", centerId: centerA } as SessionUser,
          student,
          { dateOfBirth: "2000-01-01", reason: "x" },
        ),
      /super admin/i,
    );
    assert(notSuper.threw && notSuper.matched, "only a super admin can verify a date of birth");

    const minorDob = new Date(Date.now() - 12 * 365.2425 * 864e5).toISOString().slice(0, 10);
    const asMinor = await verifyStudentDateOfBirth(
      actor,
      student,
      { dateOfBirth: minorDob, reason: "Saw birth certificate" },
      centerA,
    );
    assert(asMinor.isNowAdult === false, "a 12-year-old verifies as a MINOR");
    assert(
      asMinor.parentOversightDisabled === false,
      "…and parent oversight STAYS ON",
    );
    rows = await auditRows("platform.date_of_birth_verified", student, superAdminId);
    assert(
      rows[0].after_state?.parentOversightDisabled === false,
      "audit: records that oversight was not disabled",
    );

    const adultDob = new Date(Date.now() - 22 * 365.2425 * 864e5).toISOString().slice(0, 10);
    const asAdult = await verifyStudentDateOfBirth(
      actor,
      student,
      { dateOfBirth: adultDob, reason: "Saw national ID" },
      centerA,
    );
    assert(asAdult.isNowAdult === true, "a 22-year-old verifies as an ADULT");
    assert(
      asAdult.parentOversightDisabled === true,
      "SAFETY: the service reports that parent oversight is now OFF",
    );
    const stored = (
      await q(
        `SELECT date_of_birth, date_of_birth_verified_at, date_of_birth_verified_by
         FROM student_profiles WHERE user_id=$1`,
        [student],
      )
    )[0];
    assert(stored.date_of_birth_verified_at !== null, "the verification is stamped");
    assert(
      stored.date_of_birth_verified_by === superAdminId,
      "…naming the super admin who verified it",
    );
    rows = await auditRows("platform.date_of_birth_verified", student, superAdminId);
    assert(rows.length === 2, "audit: one row per verification, both kept");
    assert(
      rows[0].after_state?.parentOversightDisabled === true &&
        rows[0].after_state?.reason === "Saw national ID",
      "SAFETY audit: the row records the consequence AND the evidence seen",
    );

    section("Moving a course between centers — REFUSED");
    const courseMove = await rejects(
      () => moveCourseBetweenCenters(),
      /cannot be moved between centers/i,
    );
    assert(courseMove.threw && courseMove.matched, "moving a course between centers is refused outright");
    assert(
      /pricing snapshot|settled/i.test(courseMove.message),
      "…and the refusal explains why (frozen pricing + settled sessions)",
    );
    assert(
      (await q(`SELECT center_id FROM courses WHERE id=$1`, [courseId]))[0].center_id === centerA,
      "the course is still at its original center",
    );
  } finally {
    const u = users;
    const c = centers;
    const courses = (await q(`SELECT id FROM courses WHERE center_id = ANY($1::uuid[])`, [c])).map((r) => r.id);
    await q(`DELETE FROM payments WHERE center_id = ANY($1::uuid[])`, [c]);
    await q(`DELETE FROM transactions WHERE center_id = ANY($1::uuid[])`, [c]);
    await q(`DELETE FROM enrollments WHERE course_id = ANY($1::uuid[])`, [courses]);
    await q(`DELETE FROM sessions WHERE course_id = ANY($1::uuid[])`, [courses]);
    await q(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [courses]);
    await q(`DELETE FROM center_student_rosters WHERE center_id = ANY($1::uuid[])`, [c]);
    await q(`DELETE FROM center_teacher_affiliations WHERE center_id = ANY($1::uuid[])`, [c]);
    await q(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[]) OR center_id = ANY($2::uuid[])`, [u, c]);
    await q(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [c]);
    await q(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [u]);
    await admin.end();
    await prisma.$disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite center-platform.test.ts" })
  .then(() => main()).catch((e) => {
  console.error(e);
  process.exit(1);
});
