// H-3 — the audit row rides the mutation's own transaction.
//
// The property under test is the one the decision doc promises and that did NOT
// hold before this change: "a write cannot commit without its audit row (same
// transaction)". It is proven by making the audit insert impossible — a BEFORE
// INSERT trigger on audit_logs that raises — and then showing the mutation is
// absent afterwards. Before the *Tx split the mutation had already committed in
// its own transaction and would still be there.
import { testPool } from "../../../../packages/database/scripts/test-pool";
import bcrypt from "bcryptjs";
import { prisma } from "@repo/database";
import { adminAddStudent, adminRemoveStudent } from "@repo/server-core/backoffice/admin/center-people";
import { addRosterStudent } from "@repo/server-core/services/center/roster";
import { recordAdminAudit } from "@repo/server-core/audit/admin-audit";
import { adminCreateExpense } from "@repo/server-core/backoffice/admin/center-money";
import { adminCreateCourse } from "@repo/server-core/backoffice/admin/center-academic";
import {
  decideCollaborationRequest,
  removeStudentFromCenter,
  restoreStudentToCenter,
} from "@repo/server-core/backoffice/admin/center-control";
import type { SessionUser } from "@repo/server-core/backoffice-auth/session";

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
const q = async (sql: string, p: unknown[] = []) => (await admin.query(sql, p)).rows;

async function blockAuditWrites() {
  await q(`CREATE OR REPLACE FUNCTION edura_test_block_audit() RETURNS trigger AS $$
           BEGIN RAISE EXCEPTION 'audit blocked by h3-audit-atomicity'; END $$ LANGUAGE plpgsql`);
  await q(`DROP TRIGGER IF EXISTS edura_test_block_audit ON audit_logs`);
  await q(`CREATE TRIGGER edura_test_block_audit BEFORE INSERT ON audit_logs
           FOR EACH ROW EXECUTE FUNCTION edura_test_block_audit()`);
}
async function allowAuditWrites() {
  await q(`DROP TRIGGER IF EXISTS edura_test_block_audit ON audit_logs`);
  await q(`DROP FUNCTION IF EXISTS edura_test_block_audit()`);
}
async function threw(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

async function main() {
  const tag = "h3at-" + Math.floor(Math.random() * 1e9).toString(36);
  const hash = await bcrypt.hash("Passw0rd!H3AT", 10);
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

  try {
    console.log(`H-3 AUDIT ATOMICITY — ${tag}`);

    const superAdminId = await mkUser("super", "super_admin");
    const actor = { id: superAdminId, role: "super_admin" } as SessionUser;
    const teacher = await mkUser("teacher", "teacher");
    const student = await mkUser("student", "student");

    const centerId = (
      await q(
        `INSERT INTO centers (name, short_id, status, is_demo, updated_at)
         VALUES ($1,$2,'active',true,now()) RETURNING id`,
        [`${tag}-C`, `${tag}C`.toUpperCase().replace(/-/g, "").slice(0, 20)],
      )
    )[0].id as string;
    centers.push(centerId);

    await q(
      `INSERT INTO student_profiles (user_id, full_name, family_link_code, updated_at)
       VALUES ($1,$2,$3,now())`,
      [student, `${tag}-s`, `${tag}`.toUpperCase().replace(/-/g, "").slice(0, 12)],
    );
    await q(
      `INSERT INTO center_teacher_affiliations (center_id, teacher_id, status, center_share, expires_at, updated_at)
       VALUES ($1,$2,'active',0, now() + interval '1 year', now())`,
      [centerId, teacher],
    );

    const rosterCount = async () =>
      Number(
        (
          await q(
            `SELECT count(*)::int AS n FROM center_student_rosters WHERE center_id=$1 AND student_id=$2 AND left_at IS NULL`,
            [centerId, student],
          )
        )[0].n,
      );
    const expenseCount = async () =>
      Number((await q(`SELECT count(*)::int AS n FROM expenses WHERE center_id=$1`, [centerId]))[0].n);
    const courseCount = async () =>
      Number((await q(`SELECT count(*)::int AS n FROM courses WHERE center_id=$1`, [centerId]))[0].n);
    const auditCount = async (action: string) =>
      Number(
        (
          await q(`SELECT count(*)::int AS n FROM audit_logs WHERE action=$1 AND actor_id=$2`, [
            action,
            superAdminId,
          ])
        )[0].n,
      );
    const notificationCount = async () =>
      Number((await q(`SELECT count(*)::int AS n FROM notifications WHERE user_id=$1`, [student]))[0].n);

    section("A blocked audit row takes the roster write down with it");
    await blockAuditWrites();
    assert(await rosterCount() === 0, "precondition: the student is not on the roster");
    const addFailed = await threw(() => adminAddStudent(actor, centerId, student));
    assert(addFailed, "adminAddStudent fails when its audit row cannot be written");
    assert(await rosterCount() === 0, "…and the roster row is ABSENT — the mutation rolled back with the audit");
    assert(
      (await notificationCount()) === 0,
      "…and no notification was sent: post-commit effects never ran",
    );

    section("Same property on a money-adjacent write (expenses)");
    assert(await expenseCount() === 0, "precondition: the center has no expenses");
    const expenseFailed = await threw(() =>
      adminCreateExpense(actor, centerId, {
        amount: 5000,
        category: "supplies",
        description: `${tag}-expense`,
        expenseDate: new Date().toISOString(),
      }),
    );
    assert(expenseFailed, "adminCreateExpense fails when its audit row cannot be written");
    assert(await expenseCount() === 0, "…and no expense row exists");

    section("Same property on a multi-write mutation (course + generated sessions)");
    assert(await courseCount() === 0, "precondition: the center has no courses");
    const courseFailed = await threw(() =>
      adminCreateCourse(actor, centerId, {
        teacherId: teacher,
        title: `${tag}-course`,
        subject: "math",
        schedulePattern: {
          daysOfWeek: [1],
          startTime: "16:00",
          endTime: "18:00",
          startDate: new Date(Date.now() + 86_400_000),
          endDate: new Date(Date.now() + 30 * 86_400_000),
        },
        price: 60_000,
        maxStudents: 30,
      } as never),
    );
    assert(courseFailed, "adminCreateCourse fails when its audit row cannot be written");
    assert(await courseCount() === 0, "…and neither the course nor its sessions exist");

    section("Negative control — the OLD shape leaves the mutation behind");
    // Exactly what every one of these wrappers used to do: let the service commit
    // in its own transaction, then write the audit in a second one. With audit
    // writes blocked this is precisely the hole H-3 described — the mutation
    // survives, unaudited. Proven here rather than asserted, so the assertions
    // above cannot pass for the wrong reason.
    const acting = {
      id: superAdminId,
      role: "center_admin",
      centerId,
      locale: "ar",
    } as unknown as SessionUser;
    const legacyFailed = await threw(async () => {
      await addRosterStudent(acting, student);
      await recordAdminAudit(actor, {
        action: "center.student_added",
        targetType: "user",
        targetId: student,
        centerId,
        after: { legacyShape: true },
      });
    });
    assert(legacyFailed, "the old shape also reports a failure to the caller");
    assert(
      (await rosterCount()) === 1,
      "…but the roster row SURVIVED unaudited — the exact hole the *Tx split closes",
    );
    await q(`DELETE FROM center_student_rosters WHERE center_id=$1 AND student_id=$2`, [
      centerId,
      student,
    ]);

    section("With audit writes allowed, both land together");
    await allowAuditWrites();
    await adminAddStudent(actor, centerId, student);
    assert(await rosterCount() === 1, "the roster row is written");
    assert(await auditCount("center.student_added") === 1, "…and its audit row is written");

    await adminRemoveStudent(actor, centerId, student);
    assert(await rosterCount() === 0, "the roster removal is written");
    assert(
      await auditCount("center.student_roster_removed") === 1,
      "…and its audit row is written",
    );

    // ── The four center-control.ts sites that still audited in a SECOND
    // transaction on 2026-09-05 (VERIFICATION_REPORT.md §1 H-3). Each one now
    // joins the *Tx variant to the wrapper's own transaction, so a blocked audit
    // row must take the mutation down with it — and, with audit writes allowed,
    // both must land together.
    const activeCenterEntries = async () =>
      Number(
        (
          await q(
            `SELECT count(*)::int AS n FROM blacklist_entries
             WHERE target_id=$1 AND level='center' AND center_id=$2 AND is_active`,
            [student, centerId],
          )
        )[0].n,
      );
    const rosterBlacklisted = async () =>
      (
        await q(
          `SELECT blacklisted FROM center_student_rosters WHERE center_id=$1 AND student_id=$2 AND left_at IS NULL`,
          [centerId, student],
        )
      )[0]?.blacklisted as boolean | undefined;

    section("removeStudentFromCenter — a blocked audit row rolls the blacklist back");
    // adminRemoveStudent above marked the row `left_at`; the (center, student)
    // unique means it is re-joined, not re-created.
    await q(
      `UPDATE center_student_rosters SET left_at = NULL WHERE center_id=$1 AND student_id=$2`,
      [centerId, student],
    );
    assert(await rosterCount() === 1, "precondition: the student is back on the roster");
    assert(await activeCenterEntries() === 0, "precondition: no active center blacklist entry");
    const notificationsBefore = await notificationCount();
    await blockAuditWrites();
    const removeFailed = await threw(() =>
      removeStudentFromCenter(centerId, student, `${tag} remove`, actor),
    );
    assert(removeFailed, "removeStudentFromCenter fails when its audit row cannot be written");
    assert(await activeCenterEntries() === 0, "…and no blacklist entry exists — the mutation rolled back");
    assert(await rosterBlacklisted() === false, "…and the roster row is not marked blacklisted");
    assert(
      (await notificationCount()) === notificationsBefore,
      "…and the student was not notified: the deferred effect never ran",
    );
    await allowAuditWrites();
    await removeStudentFromCenter(centerId, student, `${tag} remove`, actor);
    assert(await activeCenterEntries() === 1, "with audit allowed the blacklist entry is written");
    assert(await rosterBlacklisted() === true, "…the roster row is marked blacklisted");
    assert(await auditCount("center.student_removed") === 1, "…and its audit row is written");

    section("restoreStudentToCenter — a blocked audit row keeps the block in place");
    await blockAuditWrites();
    const restoreFailed = await threw(() =>
      restoreStudentToCenter(centerId, student, `${tag} restore`, actor),
    );
    assert(restoreFailed, "restoreStudentToCenter fails when its audit row cannot be written");
    assert(await activeCenterEntries() === 1, "…and the blacklist entry is still active — nothing was lifted");
    assert(await rosterBlacklisted() === true, "…and the roster row is still marked blacklisted");
    await allowAuditWrites();
    await restoreStudentToCenter(centerId, student, `${tag} restore`, actor);
    assert(await activeCenterEntries() === 0, "with audit allowed the block is lifted");
    assert(await rosterBlacklisted() === false, "…the roster row is cleared");
    assert(await auditCount("center.student_restored") === 1, "…and its audit row is written");

    section("decideCollaborationRequest — approve and reject ride the wrapper's transaction");
    const grade = (await q(`SELECT id FROM grade_levels ORDER BY sort_order LIMIT 1`))[0] as {
      id: string;
    };
    const offering = (
      await q(
        `SELECT subject_id, track_id FROM subject_offerings WHERE grade_level_id=$1 AND is_active LIMIT 1`,
        [grade.id],
      )
    )[0] as { subject_id: string; track_id: string | null };
    const mkRequest = async () =>
      (
        await q(
          `INSERT INTO collaboration_requests (initiator, teacher_id, center_id, subject_id, grade_level_id,
             track_id, room_id, days_of_week, start_time, end_time, start_date, expected_students,
             proposed_center_share, proposed_pricing_method, status, expires_at, created_by, updated_at)
           VALUES ('teacher',$1,$2,$3,$4,$5,NULL,'{2,5}','18:30','20:00', now() + interval '7 days', 12,
             0,NULL,'pending', now() + interval '20 days', $1, now()) RETURNING id`,
          [teacher, centerId, offering.subject_id, grade.id, offering.track_id],
        )
      )[0].id as string;
    const requestStatus = async (id: string) =>
      (await q(`SELECT status FROM collaboration_requests WHERE id=$1`, [id]))[0].status as string;

    const collabId = await mkRequest();
    assert(await courseCount() === 0, "precondition: the center has no courses");
    await blockAuditWrites();
    const approveFailed = await threw(() =>
      decideCollaborationRequest(collabId, "approve", {}, actor),
    );
    assert(approveFailed, "approve fails when its audit row cannot be written");
    assert(await requestStatus(collabId) === "pending", "…and the request is still pending");
    assert(await courseCount() === 0, "…and no course (or schedule) was created");

    const rejectFailed = await threw(() =>
      decideCollaborationRequest(collabId, "reject", { reason: `${tag} reject` }, actor),
    );
    assert(rejectFailed, "reject fails when its audit row cannot be written");
    assert(await requestStatus(collabId) === "pending", "…and the request is still pending");

    await allowAuditWrites();
    const rejected = await decideCollaborationRequest(
      collabId,
      "reject",
      { reason: `${tag} reject` },
      actor,
    );
    assert(rejected.status === "rejected" && (await requestStatus(collabId)) === "rejected",
      "with audit allowed the rejection is written");
    assert(await auditCount("collaboration_request.rejected") === 1, "…and its audit row is written");

    const collabId2 = await mkRequest();
    const approved = await decideCollaborationRequest(collabId2, "approve", {}, actor);
    assert(
      approved.status === "accepted" && (await requestStatus(collabId2)) === "accepted",
      "with audit allowed the approval is written",
    );
    assert(await courseCount() === 1, "…the course was created in the same transaction");
    assert(await auditCount("collaboration_request.approved") === 1, "…and its audit row is written");
  } finally {
    await allowAuditWrites();
    const u = users;
    const c = centers;
    const courses = (await q(`SELECT id FROM courses WHERE center_id = ANY($1::uuid[])`, [c])).map(
      (r: { id: string }) => r.id,
    );
    await q(`DELETE FROM collaboration_requests WHERE center_id = ANY($1::uuid[])`, [c]);
    await q(`DELETE FROM blacklist_cascade_actions WHERE target_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM blacklist_entries WHERE target_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM sessions WHERE course_id = ANY($1::uuid[])`, [courses]);
    await q(`DELETE FROM enrollments WHERE course_id = ANY($1::uuid[])`, [courses]);
    await q(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [courses]);
    await q(`DELETE FROM expenses WHERE center_id = ANY($1::uuid[])`, [c]);
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

assertDbEnv(["test"], { intent: "suite h3-audit-atomicity.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
