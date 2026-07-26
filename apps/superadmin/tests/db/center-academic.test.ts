/**
 * ===========================================================================
 * PHASE 2 — ACADEMIC PARITY: a super admin manages ANY center's courses,
 * enrollments and enrollment requests, exactly as that center would.
 * ===========================================================================
 * Drives the REAL shipped services:
 *
 *   apps/superadmin/src/lib/services/admin/center-academic.ts
 *     → @repo/server-core/services/center/{courses,enrollments}.ts
 *
 * — the same kernel apps/www now calls through its route shims.
 *
 * The money question this phase raises, and the one the file is built around:
 * a course carries a FROZEN pricing snapshot (method + split bps + Method-2
 * rate) taken at creation from superadmin config, and settlement reads it.
 * So the proof asserts that snapshot is set once and then never moves — not by
 * an edit, not by a hall swap, not by a teacher reassignment, not by a cancel.
 *
 *   pnpm exec tsx --env-file=<env> tests/db/center-academic.test.ts
 * ===========================================================================
 */
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import bcrypt from "bcryptjs";
import { prisma } from "@repo/database";
import {
  adminCreateCourse,
  adminUpdateCourse,
  adminCancelCourse,
  adminReassignTeacher,
  adminGetCourse,
  adminListEnrollments,
  adminEnrollStudent,
  adminUnenrollStudent,
  adminListEnrollmentRequests,
  adminApproveEnrollmentRequest,
  adminDeclineEnrollmentRequest,
} from "@/lib/services/admin/center-academic";
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

const q = async (sql: string, p: unknown[] = []) => (await admin.query(sql, p)).rows;

/** The frozen economics of a course — what must never move after creation. */
async function frozen(courseId: string) {
  const r = (
    await q(
      `SELECT pricing_method, split_platform_bp, split_teacher_bp, split_center_bp,
              m2_center_fee, m2_center_bp, default_room_id
       FROM courses WHERE id=$1`,
      [courseId],
    )
  )[0];
  return JSON.stringify(r ?? null);
}

async function moneySnapshot(centerIds: string[], userIds: string[]) {
  return {
    transactions: await q(
      `SELECT id, amount FROM transactions WHERE center_id = ANY($1::uuid[]) ORDER BY id`,
      [centerIds],
    ),
    payments: await q(
      `SELECT id, amount FROM payments WHERE center_id = ANY($1::uuid[]) ORDER BY id`,
      [centerIds],
    ),
    settlements: await q(
      `SELECT id, center_total, present_count FROM session_settlements WHERE center_id = ANY($1::uuid[]) ORDER BY id`,
      [centerIds],
    ),
    walletLedger: await q(
      `SELECT id, delta FROM wallet_ledger WHERE student_id = ANY($1::uuid[]) ORDER BY id`,
      [userIds],
    ),
    subscriptions: await q(
      `SELECT id, price, status FROM subscriptions WHERE center_id = ANY($1::uuid[]) ORDER BY id`,
      [centerIds],
    ),
    centerWallets: await q(
      `SELECT id, wallet_balance FROM centers WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [centerIds],
    ),
  };
}

async function main() {
  const tag = "acad-" + Math.floor(Math.random() * 1e9).toString(36);
  const hash = await bcrypt.hash("Passw0rd!ACAD", 10);
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

  const day = (n: number) => new Date(Date.now() + n * 86_400_000);

  try {
    console.log(`PHASE 2 — ACADEMIC PARITY — ${tag}`);

    // ---------------- fixtures ----------------
    const superAdminId = await mkUser("super", "super_admin");
    const actor = { id: superAdminId, role: "super_admin" } as SessionUser;

    const centerA = await mkCenter("A");
    const centerB = await mkCenter("B");
    const teacher1 = await mkUser("t1", "teacher");
    const teacher2 = await mkUser("t2", "teacher");
    const teacherUnaffiliated = await mkUser("tUnaff", "teacher");
    const teacherB = await mkUser("tB", "teacher");
    const student1 = await mkUser("s1", "student");
    const student2 = await mkUser("s2", "student");
    const studentBlacklisted = await mkUser("sBl", "student");

    for (const [cid, tid] of [
      [centerA, teacher1],
      [centerA, teacher2],
      [centerB, teacherB],
    ] as const) {
      await q(
        `INSERT INTO center_teacher_affiliations (center_id, teacher_id, status, center_share, expires_at, updated_at)
         VALUES ($1,$2,'active',0, now() + interval '1 year', now())`,
        [cid, tid],
      );
    }
    // family_link_code is UNIQUE and capped at 12 chars, so the discriminator
    // has to lead — appending it collides once the tag fills the field.
    for (const [i, [sid, key]] of (
      [
        [student1, "s1"],
        [student2, "s2"],
        [studentBlacklisted, "sBl"],
      ] as const
    ).entries()) {
      await q(
        `INSERT INTO student_profiles (user_id, full_name, family_link_code, updated_at)
         VALUES ($1,$2,$3,now())`,
        [sid, `${tag}-${key}`, `${i}${tag}`.toUpperCase().replace(/-/g, "").slice(0, 12)],
      );
      await q(
        `INSERT INTO center_student_rosters (center_id, student_id, updated_at) VALUES ($1,$2,now())`,
        [centerA, sid],
      );
    }
    const roomA = (
      await q(
        `INSERT INTO rooms (center_id, name, capacity, price, updated_at)
         VALUES ($1,'Hall A',30,25000,now()) RETURNING id`,
        [centerA],
      )
    )[0].id as string;
    const roomB = (
      await q(
        `INSERT INTO rooms (center_id, name, capacity, price, updated_at)
         VALUES ($1,'Hall B',30,25000,now()) RETURNING id`,
        [centerB],
      )
    )[0].id as string;

    const before = await moneySnapshot(
      [centerA, centerB],
      [student1, student2, studentBlacklisted],
    );

    const schedule = {
      daysOfWeek: [1, 3],
      startTime: "16:00",
      endTime: "18:00",
      startDate: day(2),
      endDate: day(30),
    };

    // =====================================================================
    section("Courses — create");
    // =====================================================================
    const created = await adminCreateCourse(actor, centerA, {
      teacherId: teacher1,
      title: `${tag}-math`,
      subject: "Math",
      schedulePattern: schedule,
      price: 60_000,
      maxStudents: 3,
    });
    const courseId = created.course.id;
    assert(!!courseId, "creates a course at the target center");
    assert(created.sessionsGenerated > 0, `generates the schedule (${created.sessionsGenerated} sessions)`);
    const courseRow = (await q(`SELECT center_id, teacher_id FROM courses WHERE id=$1`, [courseId]))[0];
    assert(courseRow.center_id === centerA, "the course belongs to the acting center");

    let rows = await auditRows("center.course_created", courseId, superAdminId);
    assert(rows.length === 1, "audit: exactly one center.course_created row");
    assert(rows[0].center_id === centerA, "audit: scoped to the center");
    assert(
      rows[0].after_state?.frozenPricing !== undefined,
      "audit: records the pricing snapshot the course was frozen with",
    );

    const frozenAtCreate = await frozen(courseId);

    // Business rules, unchanged because they live in the kernel.
    const unaff = await rejects(
      () =>
        adminCreateCourse(actor, centerA, {
          teacherId: teacherUnaffiliated,
          title: `${tag}-bad`,
          subject: "Math",
          schedulePattern: schedule,
          price: 1000,
          maxStudents: 5,
        }),
      /active affiliation/i,
    );
    assert(unaff.threw && unaff.matched, "refuses a teacher with no active affiliation here");

    const foreignRoom = await rejects(
      () =>
        adminCreateCourse(actor, centerA, {
          teacherId: teacher1,
          defaultRoomId: roomB, // center B's hall
          title: `${tag}-bad2`,
          subject: "Math",
          schedulePattern: schedule,
          price: 1000,
          maxStudents: 5,
        }),
      /Hall not found at this center/i,
    );
    assert(
      foreignRoom.threw && foreignRoom.matched,
      "refuses another center's hall — no cross-tenant pricing snapshot",
    );

    // =====================================================================
    section("Courses — edit, and the frozen snapshot");
    // =====================================================================
    await adminUpdateCourse(actor, centerA, courseId, {
      title: `${tag}-math-renamed`,
      maxStudents: 5,
      pricePerMonth: 80_000,
    });
    const edited = (
      await q(`SELECT title, max_students, price_per_month FROM courses WHERE id=$1`, [courseId])
    )[0];
    assert(
      edited.title === `${tag}-math-renamed` && edited.max_students === 5,
      "edits title and capacity",
    );
    assert(Number(edited.price_per_month) === 80_000, "sets the monthly plan price");
    assert(
      (await frozen(courseId)) === frozenAtCreate,
      "MONEY: the frozen pricing snapshot is byte-identical after the edit",
    );
    rows = await auditRows("center.course_updated", courseId, superAdminId);
    assert(rows.length === 1, "audit: exactly one center.course_updated row");
    assert(
      rows[0].after_state?.frozenPricingUnchanged === true,
      "audit: the record itself asserts the frozen pricing did not move",
    );

    // The hall is part of the money arrangement — it cannot be attached later.
    const hallSwap = await rejects(
      () => adminUpdateCourse(actor, centerA, courseId, { defaultRoomId: roomA } as never),
      /hall cannot be attached|cannot be changed/i,
    );
    assert(
      hallSwap.threw && hallSwap.matched,
      "MONEY: a hall cannot be attached to an existing course (snapshot would be bypassed)",
    );
    assert(
      (await frozen(courseId)) === frozenAtCreate,
      "MONEY: the refused hall swap changed nothing",
    );

    // Isolation on a write.
    // Two layers can stop this and BOTH are correct: RLS filters the row out
    // entirely while the tenant is center B (-> "Course not found"), or, if the
    // row were visible, requireCenterScope refuses it ("different center").
    // The assertion is on the OUTCOME plus the fact that one of them fired.
    const crossEdit = await rejects(
      () => adminUpdateCourse(actor, centerB, courseId, { title: "hijack" }),
      /different center|not found/i,
    );
    assert(
      crossEdit.threw && crossEdit.matched,
      `isolation: center A's course cannot be edited while acting as center B (${crossEdit.message})`,
    );
    assert(
      (await q(`SELECT title FROM courses WHERE id=$1`, [courseId]))[0].title !==
        "hijack",
      "isolation: the refused cross-center edit changed nothing",
    );

    // =====================================================================
    section("Enrollments");
    // =====================================================================
    const e1 = await adminEnrollStudent(actor, centerA, { studentId: student1, courseId });
    assert(!!e1.id, "enrols a student");
    assert(
      (await q(`SELECT enrolled_by FROM enrollments WHERE id=$1`, [e1.id]))[0].enrolled_by ===
        superAdminId,
      "enrolled_by records the SUPER ADMIN — the real actor, not the center",
    );
    const subsAfterEnrol = await q(
      `SELECT count(*)::int c FROM subscriptions WHERE course_id=$1`,
      [courseId],
    );
    assert(
      subsAfterEnrol[0].c === 0,
      "MONEY: enrolling created NO subscription — a seat is not paid coverage",
    );
    rows = await auditRows("center.student_enrolled", e1.id, superAdminId);
    assert(rows.length === 1, "audit: exactly one center.student_enrolled row");
    assert(
      rows[0].after_state?.subscriptionCreated === false,
      "audit: records that no coverage was granted",
    );

    const dupe = await rejects(
      () => adminEnrollStudent(actor, centerA, { studentId: student1, courseId }),
      /already enrolled/i,
    );
    assert(dupe.threw && dupe.matched, "refuses a duplicate active enrollment");

    // Blacklist gate — the kernel's, at center level.
    const blEntry = (
      await q(
        `INSERT INTO blacklist_entries (target_id, level, center_id, imposed_by_id, reason, is_active)
         VALUES ($1,'center',$2,$3,'proof',true) RETURNING id`,
        [studentBlacklisted, centerA, superAdminId],
      )
    )[0].id as string;
    const blocked = await rejects(
      () => adminEnrollStudent(actor, centerA, { studentId: studentBlacklisted, courseId }),
      /blacklisted/i,
    );
    assert(blocked.threw && blocked.matched, "the blacklist gate still refuses the enrollment");
    await q(`DELETE FROM blacklist_entries WHERE id=$1`, [blEntry]);

    const list = await adminListEnrollments(actor, centerA);
    assert(list.length === 1 && list[0].studentId === student1, "lists this center's enrollments");
    assert(
      (await adminListEnrollments(actor, centerB)).length === 0,
      "isolation: center B has none of A's enrollments",
    );

    await adminUnenrollStudent(actor, centerA, e1.id);
    const unenrolled = (
      await q(`SELECT status, unenrolled_at FROM enrollments WHERE id=$1`, [e1.id])
    )[0];
    assert(
      unenrolled.status === "unenrolled" && unenrolled.unenrolled_at !== null,
      "unenrolling is SOFT — the row survives with a date",
    );
    rows = await auditRows("center.student_unenrolled", e1.id, superAdminId);
    assert(
      rows.length === 1 && rows[0].after_state?.refunded === false,
      "audit: one row, recording that nothing was refunded",
    );

    // =====================================================================
    section("Enrollment requests");
    // =====================================================================
    const reqId = (
      await q(
        `INSERT INTO enrollment_requests (student_id, course_id, center_id, status, expires_at, updated_at)
         VALUES ($1,$2,$3,'pending', now() + interval '7 days', now()) RETURNING id`,
        [student2, courseId, centerA],
      )
    )[0].id as string;

    const pending = await adminListEnrollmentRequests(actor, centerA, { status: "pending" });
    assert(pending.length === 1 && pending[0].id === reqId, "lists pending enrollment requests");

    await adminApproveEnrollmentRequest(actor, centerA, reqId);
    assert(
      (await q(`SELECT status FROM enrollment_requests WHERE id=$1`, [reqId]))[0].status ===
        "approved",
      "approves a request",
    );
    assert(
      (await q(`SELECT count(*)::int c FROM enrollments WHERE student_id=$1 AND course_id=$2 AND status='active'`, [student2, courseId]))[0].c === 1,
      "…and creates the enrollment",
    );
    rows = await auditRows("center.enrollment_request_approved", reqId, superAdminId);
    assert(rows.length === 1, "audit: exactly one approval row");
    assert(rows[0].before_state?.status === "pending", "audit: the prior status is recorded");

    const reqId2 = (
      await q(
        `INSERT INTO enrollment_requests (student_id, course_id, center_id, status, expires_at, updated_at)
         VALUES ($1,$2,$3,'pending', now() + interval '7 days', now()) RETURNING id`,
        [studentBlacklisted, courseId, centerA],
      )
    )[0].id as string;
    await adminDeclineEnrollmentRequest(actor, centerA, reqId2, "Proof run");
    assert(
      (await q(`SELECT status, decline_reason FROM enrollment_requests WHERE id=$1`, [reqId2]))[0]
        .decline_reason === "Proof run",
      "declines a request with a reason",
    );
    rows = await auditRows("center.enrollment_request_declined", reqId2, superAdminId);
    assert(rows.length === 1, "audit: exactly one decline row");

    const expiredId = (
      await q(
        `INSERT INTO enrollment_requests (student_id, course_id, center_id, status, expires_at, updated_at)
         VALUES ($1,$2,$3,'pending', now() - interval '1 day', now()) RETURNING id`,
        [student1, courseId, centerA],
      )
    )[0].id as string;
    const expired = await rejects(
      () => adminApproveEnrollmentRequest(actor, centerA, expiredId),
      /expired/i,
    );
    assert(expired.threw && expired.matched, "business rule holds: an EXPIRED request is refused");

    // =====================================================================
    section("Reassign teacher, then cancel");
    // =====================================================================
    const beforeSessions = await q(
      `SELECT count(*)::int c FROM sessions WHERE course_id=$1 AND teacher_id=$2`,
      [courseId, teacher1],
    );
    await adminReassignTeacher(actor, centerA, courseId, teacher2);
    assert(
      (await q(`SELECT teacher_id FROM courses WHERE id=$1`, [courseId]))[0].teacher_id === teacher2,
      "reassigns the course teacher",
    );
    assert(
      (await q(`SELECT count(*)::int c FROM sessions WHERE course_id=$1 AND teacher_id=$2`, [courseId, teacher2]))[0].c === beforeSessions[0].c,
      "…and moves the future sessions with it",
    );
    assert(
      (await frozen(courseId)) === frozenAtCreate,
      "MONEY: reassigning the teacher did not move the frozen snapshot",
    );
    rows = await auditRows("center.course_teacher_reassigned", courseId, superAdminId);
    assert(
      rows.length === 1 && rows[0].before_state?.teacherId === teacher1,
      "audit: one row, recording the previous teacher",
    );

    const reassignUnaff = await rejects(
      () => adminReassignTeacher(actor, centerA, courseId, teacherUnaffiliated),
      /active affiliation/i,
    );
    assert(
      reassignUnaff.threw && reassignUnaff.matched,
      "refuses reassigning to an unaffiliated teacher",
    );

    await adminCancelCourse(actor, centerA, courseId, "Proof run");
    assert(
      (await q(`SELECT status FROM courses WHERE id=$1`, [courseId]))[0].status === "cancelled",
      "cancels the course",
    );
    assert(
      (await q(`SELECT count(*)::int c FROM sessions WHERE course_id=$1 AND status='scheduled'`, [courseId]))[0].c === 0,
      "…cancelling its future sessions",
    );
    assert(
      (await frozen(courseId)) === frozenAtCreate,
      "MONEY: cancelling did not move the frozen snapshot either",
    );
    rows = await auditRows("center.course_cancelled", courseId, superAdminId);
    assert(rows.length === 1, "audit: exactly one center.course_cancelled row");
    assert(
      rows[0].after_state?.refunded === false &&
        rows[0].after_state?.subscriptionsCancelled === false,
      "audit: the record states plainly that nothing was refunded or cancelled financially",
    );

    const twice = await rejects(
      () => adminCancelCourse(actor, centerA, courseId, "again"),
      /already cancelled/i,
    );
    assert(twice.threw && twice.matched, "cancelling twice is refused");

    const readBack = await adminGetCourse(actor, centerA, courseId);
    assert(readBack.status === "cancelled", "reads the course back through the same scope");

    // =====================================================================
    section("MONEY — academic operations move nothing");
    // =====================================================================
    const after = await moneySnapshot(
      [centerA, centerB],
      [student1, student2, studentBlacklisted],
    );
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      assert(
        JSON.stringify(before[key]) === JSON.stringify(after[key]),
        `money witness: ${key} is byte-identical across every Academic operation`,
      );
    }
  } finally {
    const u = users;
    const c = centers;
    const courses = (await q(`SELECT id FROM courses WHERE center_id = ANY($1::uuid[])`, [c])).map(
      (r) => r.id,
    );
    await q(`DELETE FROM attendance_records WHERE course_id = ANY($1::uuid[])`, [courses]);
    await q(`DELETE FROM sessions WHERE course_id = ANY($1::uuid[])`, [courses]);
    await q(`DELETE FROM enrollment_requests WHERE course_id = ANY($1::uuid[])`, [courses]);
    await q(`DELETE FROM enrollments WHERE course_id = ANY($1::uuid[])`, [courses]);
    await q(`DELETE FROM subscriptions WHERE course_id = ANY($1::uuid[])`, [courses]);
    await q(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [courses]);
    await q(`DELETE FROM rooms WHERE center_id = ANY($1::uuid[])`, [c]);
    await q(`DELETE FROM blacklist_cascade_actions WHERE target_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM blacklist_entries WHERE target_id = ANY($1::uuid[])`, [u]);
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

// The environment guard runs BEFORE main(), so invoking this file directly
// (which bypasses the `pretest:db` step) cannot write to dev or production.
assertDbEnv(["test"], { intent: "suite center-academic.test.ts" })
  .then(() => main()).catch((e) => {
  console.error(e);
  process.exit(1);
});
