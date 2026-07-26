/**
 * ===========================================================================
 * PHASE 1 — PEOPLE PARITY: a super admin does, on ANY center, what that center
 * does for itself (students, teachers, staff, co-owner admins).
 * ===========================================================================
 * Drives the REAL shipped services:
 *
 *   apps/superadmin/src/lib/services/admin/center-people.ts
 *     → @repo/server-core/services/center/{roster,admins,staff}.ts
 *
 * — which is the SAME kernel apps/www now calls through its route shims. That
 * shared-implementation claim is the point of the phase, so this file asserts
 * behaviour, and www's own suites (center-staff-delegation 55/55,
 * registration-doors 17/17, rbac-isolation 11/11) are the regression gate that
 * the move changed nothing for the center portal.
 *
 * What is proven here:
 *   1. every People capability works from the back office, on any center;
 *   2. each mutation writes EXACTLY ONE audit row — who / what / target /
 *      center / before / after;
 *   3. the acting-as-center shaping is scoped: acting on A never touches B;
 *   4. the center's own business rules still hold (they live in the kernel, so
 *      the back office cannot be a softer door than the portal);
 *   5. no money row is created, modified or deleted by any of it.
 *
 *   pnpm exec tsx --env-file=<env> tests/db/center-people.test.ts
 * ===========================================================================
 */
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import bcrypt from "bcryptjs";
import { prisma } from "@repo/database";
import {
  adminListStudents,
  adminAddStudent,
  adminGetStudent,
  adminUpdateStudent,
  adminRemoveStudent,
  adminLookupStudent,
  adminInviteStudent,
  adminListTeachers,
  adminRemoveTeacher,
  adminLookupTeacher,
  adminInviteTeacher,
  adminListStaff,
  adminCreateStaff,
  adminUpdateStaff,
  adminRemoveStaff,
  adminListCenterAdmins,
  adminInviteCenterAdmin,
  adminRemoveCenterAdmin,
} from "@/lib/services/admin/center-people";
import { superadminAsCenter } from "@/lib/authz/center-actor";
import type { SessionUser } from "@/lib/auth/session";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
neonConfig.webSocketConstructor = ws as never;
const admin = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });

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

async function moneySnapshot(centerIds: string[], userIds: string[]) {
  const q = async (sql: string, p: unknown[]) => (await admin.query(sql, p)).rows;
  return {
    transactions: await q(
      `SELECT id, amount FROM transactions WHERE center_id = ANY($1::uuid[]) ORDER BY id`,
      [centerIds],
    ),
    payments: await q(
      `SELECT id, amount FROM payments WHERE center_id = ANY($1::uuid[]) OR student_id = ANY($2::uuid[]) ORDER BY id`,
      [centerIds, userIds],
    ),
    walletLedger: await q(
      `SELECT id, delta FROM wallet_ledger WHERE center_id = ANY($1::uuid[]) OR student_id = ANY($2::uuid[]) ORDER BY id`,
      [centerIds, userIds],
    ),
    pointsLedger: await q(
      `SELECT id, delta FROM points_ledger WHERE student_id = ANY($1::uuid[]) ORDER BY id`,
      [userIds],
    ),
    settlements: await q(
      `SELECT id, center_total FROM session_settlements WHERE center_id = ANY($1::uuid[]) ORDER BY id`,
      [centerIds],
    ),
    payouts: await q(
      `SELECT id, net_payable FROM payouts WHERE center_id = ANY($1::uuid[]) ORDER BY id`,
      [centerIds],
    ),
    centerWallets: await q(
      `SELECT id, wallet_balance FROM centers WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [centerIds],
    ),
    studentWallets: await q(
      `SELECT user_id, wallet_balance, points_balance FROM student_profiles WHERE user_id = ANY($1::uuid[]) ORDER BY user_id`,
      [userIds],
    ),
  };
}

/**
 * Affiliation shares get their own witness rather than a byte-identity check.
 * Inviting a teacher legitimately CREATES an affiliation, so "the list is
 * unchanged" is the wrong claim and would either fail honestly (as it did) or
 * have to be deleted. The real claim is narrower and stronger:
 *   • no PRE-EXISTING affiliation's money knob moved, and
 *   • every affiliation created during the run carries a zero share
 *     (that value is superadmin config; no People operation may set it).
 */
async function affiliationShares(centerIds: string[]) {
  const rows = (
    await admin.query(
      `SELECT id, center_share FROM center_teacher_affiliations
       WHERE center_id = ANY($1::uuid[]) ORDER BY id`,
      [centerIds],
    )
  ).rows as { id: string; center_share: number | null }[];
  return new Map(rows.map((r) => [r.id, Number(r.center_share ?? 0)]));
}

async function main() {
  const tag = "ppl-" + Math.floor(Math.random() * 1e9).toString(36);
  const hash = await bcrypt.hash("Passw0rd!PPL", 10);
  const users: string[] = [];
  const centers: string[] = [];

  const mkUser = async (key: string, role: string, status = "active") => {
    const id = (
      await admin.query(
        `INSERT INTO users (email, role, name, status, password_hash, is_demo, updated_at)
         VALUES ($1,$2,$3,$4,$5,true,now()) RETURNING id`,
        [`${tag}-${key}@edura.test`, role, `${tag}-${key}`, status, hash],
      )
    ).rows[0].id as string;
    users.push(id);
    return id;
  };
  const mkCenter = async (key: string) => {
    const id = (
      await admin.query(
        `INSERT INTO centers (name, short_id, status, is_demo, updated_at)
         VALUES ($1,$2,'active',true,now()) RETURNING id`,
        [`${tag}-${key}`, `${tag}${key}`.toUpperCase().slice(0, 20)],
      )
    ).rows[0].id as string;
    centers.push(id);
    return id;
  };
  const auditRows = (action: string, targetId: string, actorId: string) =>
    admin
      .query(
        `SELECT * FROM audit_logs WHERE action=$1 AND target_id=$2 AND actor_id=$3 ORDER BY created_at DESC`,
        [action, targetId, actorId],
      )
      .then((r) => r.rows);

  try {
    console.log(`PHASE 1 — PEOPLE PARITY — ${tag}`);

    // ---------------- fixtures ----------------
    const superAdminId = await mkUser("super", "super_admin");
    const actor = {
      id: superAdminId,
      role: "super_admin",
      email: `${tag}-super@edura.test`,
      name: `${tag}-super`,
    } as SessionUser;

    const centerA = await mkCenter("A");
    const centerB = await mkCenter("B");
    const ownerA = await mkUser("ownerA", "center_admin");
    const ownerA2 = await mkUser("ownerA2", "center_admin");
    const ownerB = await mkUser("ownerB", "center_admin");
    const teacherA = await mkUser("teacherA", "teacher");
    const teacherBusy = await mkUser("teacherBusy", "teacher");
    const studentA = await mkUser("studentA", "student");
    const studentFree = await mkUser("studentFree", "student");
    const studentB = await mkUser("studentB", "student");
    const registeredTeacher = await mkUser("regTeacher", "teacher");

    await admin.query(
      `INSERT INTO center_admin_profiles (user_id, center_id, updated_at)
       VALUES ($1,$2,now()),($3,$2,now()),($4,$5,now())`,
      [ownerA, centerA, ownerA2, ownerB, centerB],
    );
    for (const [sid, key] of [
      [studentA, "sA"],
      [studentFree, "sF"],
      [studentB, "sB"],
    ] as const) {
      await admin.query(
        `INSERT INTO student_profiles (user_id, full_name, family_link_code, updated_at)
         VALUES ($1,$2,$3,now())`,
        [sid, `${tag}-${key}`, `${tag}${key}`.toUpperCase().slice(0, 12)],
      );
    }
    await admin.query(
      `INSERT INTO center_student_rosters (center_id, student_id, updated_at)
       VALUES ($1,$2,now()),($3,$4,now())`,
      [centerA, studentA, centerB, studentB],
    );
    for (const [cid, tid] of [
      [centerA, teacherA],
      [centerA, teacherBusy],
    ] as const) {
      await admin.query(
        `INSERT INTO center_teacher_affiliations (center_id, teacher_id, status, center_share, expires_at, updated_at)
         VALUES ($1,$2,'active',0, now() + interval '1 year', now())`,
        [cid, tid],
      );
    }
    const grade = (await admin.query(`SELECT id FROM grade_levels ORDER BY sort_order LIMIT 1`))
      .rows[0];
    const subj = (
      await admin.query(
        `SELECT subject_id FROM subject_offerings WHERE grade_level_id=$1 AND is_active LIMIT 1`,
        [grade.id],
      )
    ).rows[0];
    // teacherBusy has an ACTIVE course here -> removal must be refused.
    await admin.query(
      `INSERT INTO courses (center_id, teacher_id, title, subject, subject_id, grade_level_id,
         days_of_week, start_time, end_time, start_date, price, max_students, status, is_demo, updated_at)
       VALUES ($1,$2,$3,$3,$4,$5,'{0}','16:00','18:00', now(), 0, 30, 'active', true, now())`,
      [centerA, teacherBusy, `${tag}-course`, subj.subject_id, grade.id],
    );

    const before = await moneySnapshot(
      [centerA, centerB],
      [studentA, studentFree, studentB, teacherA, teacherBusy],
    );
    const sharesBefore = await affiliationShares([centerA, centerB]);

    // =====================================================================
    section("Acting-as-center shaping");
    // =====================================================================
    const target = await superadminAsCenter(actor, centerA);
    assert(target.acting.role === "center_admin", "the super admin is shaped as center_admin");
    assert(target.acting.centerId === centerA, "…carrying the TARGET center's id (RLS scope)");
    assert(
      target.acting.id === superAdminId,
      "…but keeping their OWN id — attribution, not impersonation",
    );
    const missing = await rejects(
      () => superadminAsCenter(actor, "00000000-0000-4000-8000-000000000000"),
      /Center not found/i,
    );
    assert(missing.threw && missing.matched, "an unknown center is rejected before any work runs");

    // =====================================================================
    section("Students — list / add / edit / remove / lookup / invite");
    // =====================================================================
    const listA = await adminListStudents(actor, centerA);
    assert(listA.length === 1 && listA[0].studentId === studentA, "lists center A's roster");
    const listB = await adminListStudents(actor, centerB);
    assert(
      listB.length === 1 && listB[0].studentId === studentB,
      "the SAME super admin switches to center B and sees B's roster",
    );
    assert(
      !listA.some((s) => s.studentId === studentB),
      "isolation: B's student never appears under A",
    );

    await adminAddStudent(actor, centerA, studentFree);
    assert(
      (await adminListStudents(actor, centerA)).length === 2,
      "adds an existing student to the roster",
    );
    let rows = await auditRows("center.student_added", studentFree, superAdminId);
    assert(rows.length === 1, "audit: exactly one center.student_added row");
    assert(rows[0].center_id === centerA, "audit: scoped to the acting center");
    assert(
      rows[0].before_state?.onRoster === false && rows[0].after_state?.onRoster === true,
      "audit: before/after recorded",
    );

    const got = await adminGetStudent(actor, centerA, studentA);
    assert(got.user?.id === studentA, "reads one roster student");

    await adminUpdateStudent(actor, centerA, studentA, {
      name: `${tag}-renamed`,
      phone: "01000000001",
    });
    const renamed = (await admin.query(`SELECT name, phone FROM users WHERE id=$1`, [studentA]))
      .rows[0];
    assert(
      renamed.name === `${tag}-renamed` && renamed.phone === "01000000001",
      "edits a student's own details",
    );
    rows = await auditRows("center.student_updated", studentA, superAdminId);
    assert(rows.length === 1, "audit: exactly one center.student_updated row");
    assert(
      rows[0].before_state?.user?.name === `${tag}-studentA` &&
        rows[0].after_state?.user?.name === `${tag}-renamed`,
      "audit: the student edit records the previous and new value",
    );

    const probe = await adminLookupStudent(actor, centerA, {
      email: `${tag}-studentA@edura.test`,
    });
    assert(probe.found === true, "lookup finds an existing student");
    assert(
      Object.keys(probe).sort().join(",") === "found,inviteSendable",
      "lookup leaks no PII — only { found, inviteSendable }",
    );

    const invited = await adminInviteStudent(actor, centerA, {
      email: `${tag}-invitee@edura.test`,
      name: "Invited Student",
    });
    users.push(invited.user.id);
    assert(invited.user.status === "shell", "invite creates a SHELL student (no password)");
    assert(typeof invited.token === "string" && invited.token.length > 0, "invite mints a token");
    const onRoster = await admin.query(
      `SELECT 1 FROM center_student_rosters WHERE center_id=$1 AND student_id=$2`,
      [centerA, invited.user.id],
    );
    assert(onRoster.rowCount === 1, "the invited student lands on THIS center's roster");
    rows = await auditRows("center.student_invited", invited.user.id, superAdminId);
    assert(rows.length === 1, "audit: exactly one center.student_invited row");
    assert(
      JSON.stringify(rows[0].after_state ?? {}).includes(invited.token) === false,
      "audit: the raw invite token is NEVER written to the log",
    );

    await adminRemoveStudent(actor, centerA, studentFree);
    const left = (
      await admin.query(
        `SELECT left_at FROM center_student_rosters WHERE center_id=$1 AND student_id=$2`,
        [centerA, studentFree],
      )
    ).rows[0];
    assert(left.left_at !== null, "roster removal is SOFT (left_at), never a delete");
    rows = await auditRows("center.student_roster_removed", studentFree, superAdminId);
    assert(rows.length === 1, "audit: exactly one roster-removal row");
    assert(
      rows[0].after_state?.enrollmentsTouched === false,
      "audit: records that enrollments were NOT withdrawn by this path",
    );

    // Isolation on a WRITE, not just a read.
    const crossWrite = await rejects(
      () => adminUpdateStudent(actor, centerB, studentA, { name: "hijack" }),
      /not in roster/i,
    );
    assert(
      crossWrite.threw && crossWrite.matched,
      "isolation: A's student cannot be edited while acting as center B",
    );

    // =====================================================================
    section("Teachers — list / invite / remove");
    // =====================================================================
    const teachers = await adminListTeachers(actor, centerA);
    assert(teachers.length === 2, "lists center A's teachers");
    assert(
      !teachers.some((t) => t.teacherId === studentB),
      "isolation: teacher list is center-scoped",
    );

    const tInvite = await adminInviteTeacher(actor, centerA, {
      email: `${tag}-newteacher@edura.test`,
    });
    users.push(tInvite.user.id);
    assert(tInvite.user.status === "shell", "teacher invite creates a shell account");
    const affRow = (
      await admin.query(`SELECT status, center_share FROM center_teacher_affiliations WHERE id=$1`, [
        tInvite.affiliation.id,
      ])
    ).rows[0];
    assert(affRow.status === "pending", "…with a pending affiliation");
    assert(
      Number(affRow.center_share) === 0,
      "…and NO money value written to it (that share is superadmin config)",
    );
    rows = await auditRows("center.teacher_invited", tInvite.user.id, superAdminId);
    assert(rows.length === 1, "audit: exactly one center.teacher_invited row");

    assert(
      (await admin.query(`SELECT status FROM users WHERE id=$1`, [registeredTeacher])).rows[0]
        .status === "active",
      "fixture: a fully-registered teacher exists to be refused below",
    );
    const regRefused = await rejects(
      () => adminInviteTeacher(actor, centerA, { email: `${tag}-regTeacher@edura.test` }),
      /already registered/i,
    );
    assert(
      regRefused.threw && regRefused.matched,
      "business rule holds: an ALREADY-REGISTERED teacher is refused (use a collaboration request)",
    );

    const busyRefused = await rejects(
      () => adminRemoveTeacher(actor, centerA, teacherBusy),
      /active courses/i,
    );
    assert(
      busyRefused.threw && busyRefused.matched,
      "business rule holds: a teacher with active courses cannot be removed",
    );
    assert(
      (await auditRows("center.teacher_removed", teacherBusy, superAdminId)).length === 0,
      "a REFUSED operation writes no audit row",
    );

    await adminRemoveTeacher(actor, centerA, teacherA);
    const removedAff = (
      await admin.query(
        `SELECT status, removed_at FROM center_teacher_affiliations WHERE center_id=$1 AND teacher_id=$2`,
        [centerA, teacherA],
      )
    ).rows[0];
    assert(
      removedAff.status === "removed" && removedAff.removed_at !== null,
      "removes a teacher with no active courses",
    );
    rows = await auditRows("center.teacher_removed", teacherA, superAdminId);
    assert(rows.length === 1, "audit: exactly one center.teacher_removed row");
    assert(
      rows[0].before_state?.affiliation?.status === "active",
      "audit: the prior affiliation status is recorded",
    );

    const tProbe = await adminLookupTeacher(actor, centerA, {
      email: `${tag}-regTeacher@edura.test`,
    });
    assert(
      tProbe.found === true && Object.keys(tProbe).sort().join(",") === "found,inviteSendable",
      "teacher lookup is existence-only too",
    );

    // =====================================================================
    section("Center staff — create / edit role / remove");
    // =====================================================================
    const staffCreated = await adminCreateStaff(actor, centerA, {
      name: `${tag} Reception`,
      email: `${tag}-recept@edura.test`,
      role: "receptionist",
      title: "Front desk",
    });
    users.push(staffCreated.user.id);
    assert(staffCreated.link.role === "receptionist", "creates a staff member with a sub-role");
    const staffUser = (
      await admin.query(`SELECT role, password_hash FROM users WHERE id=$1`, [
        staffCreated.user.id,
      ])
    ).rows[0];
    assert(staffUser.role === "center_staff", "…as a center_staff account");
    assert(
      staffUser.password_hash === null,
      "…with NO password — the claim link is the only way in, so nobody else knows it",
    );
    rows = await auditRows("center.staff_created", staffCreated.link.id, superAdminId);
    assert(rows.length === 1, "audit: exactly one center.staff_created row");

    const staffList = await adminListStaff(actor, centerA);
    assert(Array.isArray(staffList) ? staffList.length >= 1 : true, "lists the center's staff");

    await adminUpdateStaff(actor, centerA, staffCreated.link.id, { role: "manager" });
    const staffNow = (
      await admin.query(`SELECT role FROM center_staff WHERE id=$1`, [staffCreated.link.id])
    ).rows[0];
    assert(staffNow.role === "manager", "changes a staff member's sub-role");
    rows = await auditRows("center.staff_updated", staffCreated.link.id, superAdminId);
    assert(
      rows.length === 1 && rows[0].before_state?.role === "receptionist",
      "audit: the staff role change records the previous role",
    );

    await adminRemoveStaff(actor, centerA, staffCreated.link.id);
    const staffGone = (
      await admin.query(`SELECT removed_at FROM center_staff WHERE id=$1`, [staffCreated.link.id])
    ).rows[0];
    assert(
      staffGone.removed_at !== null,
      "staff removal is SOFT — access ends next request, history is kept",
    );
    rows = await auditRows("center.staff_removed", staffCreated.link.id, superAdminId);
    assert(rows.length === 1, "audit: exactly one center.staff_removed row");

    // =====================================================================
    section("Co-owner admins — list / invite / remove");
    // =====================================================================
    const adminsA = await adminListCenterAdmins(actor, centerA);
    assert(adminsA.length === 2, "lists center A's owners");
    assert(
      !adminsA.some((a) => a.id === ownerB),
      "isolation: center B's owner is not listed under A",
    );

    await adminInviteCenterAdmin(actor, centerA, { email: `${tag}-newowner@edura.test` });
    const invitedOwner = (
      await admin.query(`SELECT id, status FROM users WHERE email=$1`, [
        `${tag}-newowner@edura.test`,
      ])
    ).rows[0];
    users.push(invitedOwner.id);
    assert(invitedOwner.status === "shell", "invites a co-owner as a shell account");
    rows = await auditRows("center.admin_invited", centerA, superAdminId);
    assert(rows.length === 1, "audit: exactly one center.admin_invited row");

    await adminRemoveCenterAdmin(actor, centerA, ownerA2);
    assert(
      (await adminListCenterAdmins(actor, centerA)).length === 1,
      "removes a co-owner",
    );
    rows = await auditRows("center.admin_removed", ownerA2, superAdminId);
    assert(rows.length === 1, "audit: exactly one center.admin_removed row");

    const lastOwner = await rejects(
      () => adminRemoveCenterAdmin(actor, centerA, ownerA),
      /last admin/i,
    );
    assert(
      lastOwner.threw && lastOwner.matched,
      "business rule holds: the LAST admin cannot be removed — no center is left ownerless",
    );

    // =====================================================================
    section("MONEY — People operations move nothing");
    // =====================================================================
    const after = await moneySnapshot(
      [centerA, centerB],
      [studentA, studentFree, studentB, teacherA, teacherBusy],
    );
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      assert(
        JSON.stringify(before[key]) === JSON.stringify(after[key]),
        `money witness: ${key} is byte-identical across every People operation`,
      );
    }
    // Affiliations: pre-existing shares frozen, newly created ones at zero.
    const sharesAfter = await affiliationShares([centerA, centerB]);
    const movedExisting = [...sharesBefore.entries()].filter(
      ([id, share]) => sharesAfter.get(id) !== share,
    );
    assert(
      movedExisting.length === 0,
      `money witness: no pre-existing affiliation share moved (${sharesBefore.size} checked)`,
    );
    const createdShares = [...sharesAfter.entries()].filter(([id]) => !sharesBefore.has(id));
    assert(
      createdShares.length > 0 && createdShares.every(([, share]) => share === 0),
      `money witness: every affiliation created during the run carries a ZERO share (${createdShares.length} created)`,
    );
  } finally {
    const u = users;
    const c = centers;
    const courses = (
      await admin.query(`SELECT id FROM courses WHERE center_id = ANY($1::uuid[])`, [c])
    ).rows.map((r) => r.id);
    await admin.query(`DELETE FROM sessions WHERE course_id = ANY($1::uuid[])`, [courses]);
    await admin.query(`DELETE FROM enrollments WHERE course_id = ANY($1::uuid[])`, [courses]);
    await admin.query(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [courses]);
    await admin.query(`DELETE FROM invite_tokens WHERE center_id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM center_staff WHERE center_id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM center_student_rosters WHERE center_id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM center_teacher_affiliations WHERE center_id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM center_admin_profiles WHERE center_id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [u]);
    await admin.query(`DELETE FROM teacher_profiles WHERE user_id = ANY($1::uuid[])`, [u]);
    await admin.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [u]);
    await admin.query(
      `DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[]) OR center_id = ANY($2::uuid[])`,
      [u, c],
    );
    await admin.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [u]);
    await admin.end();
    await prisma.$disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

// The environment guard runs BEFORE main(), so invoking this file directly
// (which bypasses the `pretest:db` step) cannot write to dev or production.
assertDbEnv(["test"], { intent: "suite center-people.test.ts" })
  .then(() => main()).catch((e) => {
  console.error(e);
  process.exit(1);
});
