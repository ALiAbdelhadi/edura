import { testPool } from "../../../../packages/database/scripts/test-pool";
import bcrypt from "bcryptjs";
import { prisma, withPlatformContext } from "@repo/database";
import { sessionFor, signInDoor } from "./helpers/auth-door";
import {
  centerOverview,
  centerStudents,
  centerCourses,
  centerSessions,
  centerEnrollments,
  centerSubscriptions,
  centerAttendance,
  centerStaffAccounts,
  centerPendingItems,
  centerFinanceSummary,
  centerTransactions,
  centerPayments,
  centerPayouts,
  centerSettlements,
  centerWalletMovements,
} from "@/lib/services/admin/center-oversight";
import {
  setCenterStatus,
  setCenterMemberStatus,
  removeStudentFromCenter,
  restoreStudentToCenter,
  decideCollaborationRequest,
  updateCenterProfile,
  updateCenterRoomProfile,
} from "@/lib/services/admin/center-control";
import { listAuditLogs } from "@/lib/services/admin/audit-log";
import type { SessionUser } from "@/lib/auth/session";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

const PW = "Passw0rd!OVS";
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
function section(title: string) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 66 - title.length))}`);
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

const sessionRowsOf = async (userId: string) =>
  Number(
    (await admin.query(`SELECT count(*)::int AS n FROM auth_sessions WHERE user_id=$1`, [userId]))
      .rows[0].n,
  );

const plantSession = (userId: string) =>
  admin.query(
    `INSERT INTO auth_sessions (token, user_id, expires_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, now() + interval '7 days', now())`,
    [userId],
  );

const MONEY_TABLES = [
  "transactions",
  "points_ledger",
  "wallet_ledger",
  "session_settlements",
  "payments",
  "payouts",
  "invoices",
  "expenses",
  "audit_logs",
] as const;

async function moneySnapshot(centerIds: string[], studentIds: string[]) {
  const q = async (sql: string, params: unknown[]) => (await admin.query(sql, params)).rows;
  return {
    transactions: await q(
      `SELECT id, amount, status FROM transactions WHERE center_id = ANY($1::uuid[])
       OR from_entity_id = ANY($2::uuid[]) OR to_entity_id = ANY($2::uuid[]) ORDER BY id`,
      [centerIds, studentIds],
    ),
    walletLedger: await q(
      `SELECT id, delta, balance_after FROM wallet_ledger
       WHERE center_id = ANY($1::uuid[]) OR student_id = ANY($2::uuid[]) ORDER BY id`,
      [centerIds, studentIds],
    ),
    payments: await q(
      `SELECT id, amount FROM payments WHERE center_id = ANY($1::uuid[])
       OR student_id = ANY($2::uuid[]) ORDER BY id`,
      [centerIds, studentIds],
    ),
    settlements: await q(
      `SELECT id, platform_total, center_total, teacher_total FROM session_settlements
       WHERE center_id = ANY($1::uuid[]) ORDER BY id`,
      [centerIds],
    ),
    payouts: await q(
      `SELECT id, net_payable, status FROM payouts WHERE center_id = ANY($1::uuid[])
       OR beneficiary_id = ANY($2::uuid[]) ORDER BY id`,
      [centerIds, studentIds],
    ),
    pointsLedger: await q(
      `SELECT id, delta, balance_after FROM points_ledger WHERE student_id = ANY($1::uuid[]) ORDER BY id`,
      [studentIds],
    ),
    centerWallets: await q(
      `SELECT id, wallet_balance FROM centers WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [centerIds],
    ),
    studentWallets: await q(
      `SELECT user_id, wallet_balance, points_balance FROM student_profiles
       WHERE user_id = ANY($1::uuid[]) ORDER BY user_id`,
      [studentIds],
    ),
  };
}

async function main() {
  const tag = "ovs-" + Math.floor(Math.random() * 1e9).toString(36);
  const hash = await bcrypt.hash(PW, 10);
  const created: { users: string[]; centers: string[] } = { users: [], centers: [] };

  const mkUser = async (key: string, role: string) => {
    const id = (
      await admin.query(
        `INSERT INTO users (email, role, name, status, password_hash, is_demo, updated_at)
         VALUES ($1,$2,$3,'active',$4,true,now()) RETURNING id`,
        [`${tag}-${key}@edura.test`, role, `${tag}-${key}`, hash],
      )
    ).rows[0].id as string;
    created.users.push(id);
    return id;
  };
  const mkCenter = async (key: string) => {
    const id = (
      await admin.query(
        `INSERT INTO centers (name, short_id, status, is_demo, updated_at)
         VALUES ($1,$2,'active',true,now()) RETURNING id`,
        [`${tag}-${key}`, `${tag}-${key}`.toUpperCase().slice(0, 20)],
      )
    ).rows[0].id as string;
    created.centers.push(id);
    return id;
  };

  try {
    console.log(`SUPERADMIN CENTER OVERSIGHT — ${tag}`);

    const superAdminId = await mkUser("super", "super_admin");
    const centerA = await mkCenter("centerA");
    const centerB = await mkCenter("centerB");
    const adminA = await mkUser("adminA", "center_admin");
    const teacherA = await mkUser("teacherA", "teacher");
    const studentA = await mkUser("studentA", "student");
    const studentA2 = await mkUser("studentA2", "student");
    const staffA = await mkUser("staffA", "center_staff");
    const adminB = await mkUser("adminB", "center_admin");
    const teacherB = await mkUser("teacherB", "teacher");
    const studentB = await mkUser("studentB", "student");

    const actor: SessionUser = {
      id: superAdminId,
      role: "super_admin",
      email: `${tag}-super@edura.test`,
      name: `${tag}-super`,
    } as SessionUser;

    const grade = (await admin.query(`SELECT id FROM grade_levels ORDER BY sort_order LIMIT 1`))
      .rows[0];
    const subject = (
      await admin.query(
        `SELECT subject_id, track_id FROM subject_offerings WHERE grade_level_id=$1 AND is_active LIMIT 1`,
        [grade.id],
      )
    ).rows[0];

    await admin.query(
      `INSERT INTO center_admin_profiles (user_id, center_id, updated_at) VALUES ($1,$2,now()),($3,$4,now())`,
      [adminA, centerA, adminB, centerB],
    );
    await admin.query(
      `INSERT INTO student_profiles (user_id, full_name, family_link_code, grade_level_id, updated_at)
       VALUES ($1,$2,$3,$6,now()),($4,$5,$7,$6,now()),($8,$9,$10,$6,now())`,
      [
        studentA, `${tag}-sA`, `${tag}A`.toUpperCase().slice(0, 12),
        studentA2, `${tag}-sA2`, grade.id, `${tag}A2`.toUpperCase().slice(0, 12),
        studentB, `${tag}-sB`, `${tag}B`.toUpperCase().slice(0, 12),
      ],
    );
    const roomA = (
      await admin.query(
        `INSERT INTO rooms (center_id, name, capacity, price, updated_at)
         VALUES ($1,'Hall One',30,25000,now()) RETURNING id`,
        [centerA],
      )
    ).rows[0].id as string;

    const mkAff = (centerId: string, teacherId: string) =>
      admin.query(
        `INSERT INTO center_teacher_affiliations (center_id, teacher_id, status, center_share, expires_at, updated_at)
         VALUES ($1,$2,'active',0, now() + interval '1 year', now())`,
        [centerId, teacherId],
      );
    await mkAff(centerA, teacherA);
    await mkAff(centerB, teacherB);

    const mkRoster = (centerId: string, studentId: string) =>
      admin.query(
        `INSERT INTO center_student_rosters (center_id, student_id, updated_at) VALUES ($1,$2,now())`,
        [centerId, studentId],
      );
    await mkRoster(centerA, studentA);
    await mkRoster(centerA, studentA2);
    await mkRoster(centerB, studentB);

    await admin.query(
      `INSERT INTO center_staff (center_id, staff_user_id, role, title, updated_at)
       VALUES ($1,$2,'receptionist','Front desk',now())`,
      [centerA, staffA],
    );

    const mkCourse = async (centerId: string, teacherId: string, title: string, roomId: string | null) =>
      (
        await admin.query(
          `INSERT INTO courses (center_id, teacher_id, default_room_id, title, subject, subject_id,
             grade_level_id, days_of_week, start_time, end_time, start_date, end_date,
             price, price_per_month, max_students, status, is_demo, updated_at)
           VALUES ($1,$2,$3,$4,$4,$5,$6,'{0,3}','16:00','18:00', now() - interval '30 days',
             now() + interval '60 days', 0, 60000, 30, 'active', true, now()) RETURNING id`,
          [centerId, teacherId, roomId, title, subject.subject_id, grade.id],
        )
      ).rows[0].id as string;

    const courseA1 = await mkCourse(centerA, teacherA, `${tag}-A-math`, roomA);
    const courseA2 = await mkCourse(centerA, teacherA, `${tag}-A-chem`, null);
    const courseB1 = await mkCourse(centerB, teacherB, `${tag}-B-bio`, null);

    const sessionA = (
      await admin.query(
        `INSERT INTO sessions (course_id, teacher_id, room_id, original_date, date, start_time, end_time, status, updated_at)
         VALUES ($1,$2,$3, now() - interval '7 days', now() - interval '7 days','16:00','18:00','completed',now())
         RETURNING id`,
        [courseA1, teacherA, roomA],
      )
    ).rows[0].id as string;

    const mkEnrollment = async (studentId: string, courseId: string, centerId: string | null) =>
      (
        await admin.query(
          `INSERT INTO enrollments (student_id, course_id, center_id, status, enrolled_by, updated_at)
           VALUES ($1,$2,$3,'active',$1,now()) RETURNING id`,
          [studentId, courseId, centerId],
        )
      ).rows[0].id as string;

    const enrA1 = await mkEnrollment(studentA, courseA1, centerA);
    const enrA2 = await mkEnrollment(studentA, courseA2, centerA);
    const enrB = await mkEnrollment(studentA, courseB1, centerB); // same student, OTHER center
    await mkEnrollment(studentA2, courseA1, centerA);

    await admin.query(
      `INSERT INTO subscriptions (student_id, target_type, teacher_id, center_id, course_id, plan,
         price, status, source, is_demo, updated_at)
       VALUES ($1,'center',$2,$3,$4,'monthly',60000,'pending_payment','online',true,now())`,
      [studentA, teacherA, centerA, courseA1],
    );
    await admin.query(
      `INSERT INTO attendance_records (session_id, student_id, course_id, center_id, status, marked_by, updated_at)
       VALUES ($1,$2,$3,$4,'present',$5,now())`,
      [sessionA, studentA, courseA1, centerA, staffA],
    );

    const txnA = (
      await admin.query(
        `INSERT INTO transactions (ref_number, type, amount, center_id, status, payment_method)
         VALUES ($1,'payment',50000,$2,'completed','cash') RETURNING id`,
        [`TXN-${tag}-1`, centerA],
      )
    ).rows[0].id as string;
    await admin.query(
      `INSERT INTO transactions (ref_number, type, amount, center_id, status)
       VALUES ($1,'commission',5000,$2,'completed')`,
      [`TXN-${tag}-2`, centerA],
    );
    await admin.query(
      `INSERT INTO transactions (ref_number, type, amount, center_id, status)
       VALUES ($1,'payment',99000,$2,'completed')`,
      [`TXN-${tag}-B`, centerB], // the other center — must NOT appear under A
    );
    const paymentA = (
      await admin.query(
        `INSERT INTO payments (center_id, student_id, course_id, amount, receipt_number, recorded_by, updated_at)
         VALUES ($1,$2,$3,50000,$4,$5,now()) RETURNING id`,
        [centerA, studentA, courseA1, `RCP-${tag}-1`, staffA],
      )
    ).rows[0].id as string;
    const payoutA = (
      await admin.query(
        `INSERT INTO payouts (center_id, beneficiary_id, beneficiary_type, gross_amount, commission, net_payable, status)
         VALUES ($1,$2,'center',50000,5000,45000,'pending') RETURNING id`,
        [centerA, adminA],
      )
    ).rows[0].id as string;
    const settlementA = (
      await admin.query(
        `INSERT INTO session_settlements (session_id, course_id, center_id, teacher_id, room_id,
           pricing_method, present_count, per_session_price, platform_total, center_total, teacher_total, settled_by)
         VALUES ($1,$2,$3,$4,$5,'whole_room_percent',1,20000,2000,6000,12000,$6) RETURNING id`,
        [sessionA, courseA1, centerA, teacherA, roomA, superAdminId],
      )
    ).rows[0].id as string;
    const walletA = (
      await admin.query(
        `INSERT INTO wallet_ledger (student_id, type, delta, balance_after, method, center_id, recorded_by)
         VALUES ($1,'topup',30000,30000,'cash',$2,$3) RETURNING id`,
        [studentA, centerA, staffA],
      )
    ).rows[0].id as string;
    const pointsA = (
      await admin.query(
        `INSERT INTO points_ledger (student_id, event_name, delta, balance_after)
         VALUES ($1,'attendance',10,10) RETURNING id`,
        [studentA],
      )
    ).rows[0].id as string;
    const invoiceA = (
      await admin.query(
        `INSERT INTO invoices (invoice_number, type, center_id, subtotal, commission, net_amount, status)
         VALUES ($1,'center_statement',$2,50000,5000,45000,'issued') RETURNING id`,
        [`INV-${tag}-1`, centerA],
      )
    ).rows[0].id as string;

    const collabId = (
      await admin.query(
        `INSERT INTO collaboration_requests (initiator, teacher_id, center_id, subject_id, grade_level_id,
           track_id, room_id, days_of_week, start_time, end_time, start_date, expected_students,
           proposed_center_share, proposed_pricing_method, status, expires_at, created_by, updated_at)
         VALUES ('teacher',$1,$2,$3,$4,$5,$6,'{2,5}','18:30','20:00', now() + interval '7 days', 12,
           0,'whole_room_percent','pending', now() + interval '20 days', $1, now()) RETURNING id`,
        [teacherB, centerA, subject.subject_id, grade.id, subject.track_id, roomA],
      )
    ).rows[0].id as string;

    const before = await moneySnapshot([centerA, centerB], [studentA, studentA2, studentB]);

    section("PART 1 — full read visibility, any center");
    const ovA = await centerOverview(centerA);
    assert(ovA.center.id === centerA, "superadmin can open center A's full picture");
    assert(ovA.counts.teachers === 1 && ovA.counts.students === 2, "A: teacher + roster counts");
    assert(ovA.counts.courses === 2 && ovA.counts.rooms === 1, "A: course + room counts");
    assert(ovA.counts.staff === 1, "A: staff account count");
    assert(ovA.counts.pendingCollaborations === 1, "A: pending collaboration counted");

    const ovB = await centerOverview(centerB);
    assert(
      ovB.center.id === centerB && ovB.counts.students === 1 && ovB.counts.courses === 1,
      "the SAME superadmin can switch to center B and see its own picture",
    );

    const studentsA = await centerStudents(centerA);
    assert(
      studentsA.total === 2 && studentsA.data.every((s) => s.studentId !== studentB),
      "students: A's roster only — B's student never leaks in",
    );
    const coursesA = await centerCourses(centerA);
    assert(
      coursesA.total === 2 && !coursesA.data.some((c) => c.id === courseB1),
      "courses: scoped to A",
    );
    const sessionsA = await centerSessions(centerA);
    assert(sessionsA.total === 1 && sessionsA.data[0].id === sessionA, "sessions: via A's courses");
    const enrA = await centerEnrollments(centerA);
    assert(
      enrA.total === 3 && !enrA.data.some((e) => e.id === enrB),
      "enrollments: A's three, NOT the same student's enrollment at B",
    );
    const subsA = await centerSubscriptions(centerA);
    assert(subsA.total === 1 && subsA.data[0].price === 60000, "subscriptions: scoped + priced");
    const attA = await centerAttendance(centerA);
    assert(attA.total === 1 && attA.data[0].status === "present", "attendance: scoped");
    const staffList = await centerStaffAccounts(centerA);
    assert(
      staffList.data.length === 1 && staffList.data[0].role === "receptionist",
      "staff accounts: scoped, with sub-role",
    );
    const pending = await centerPendingItems(centerA);
    assert(
      pending.collaborationRequests.length === 1 &&
        pending.collaborationRequests[0].id === collabId,
      "pending items: the collaboration request is listed",
    );

    section("PART 1 — FINANCE: every money row tied to the center");
    const fin = await centerFinanceSummary(centerA);
    const txTotal = fin.transactions.reduce((n, t) => n + t.count, 0);
    assert(txTotal === 2, "finance summary: both of A's ledger rows counted (B's excluded)");
    assert(fin.payments.count === 1 && fin.payments.amount === 50000, "finance summary: payments");
    assert(fin.settlements.count === 1 && fin.settlements.centerTotal === 6000, "finance summary: settlements");
    assert(fin.payouts.some((p) => p.netPayable === 45000), "finance summary: payouts");
    assert(fin.invoices.some((i) => i.netAmount === 45000), "finance summary: invoices");
    assert(fin.walletMovements.count === 1 && fin.walletMovements.netDelta === 30000, "finance summary: wallet movements");
    assert(fin.walletBalance === 0, "finance summary: the center wallet balance is reported");

    const txns = await centerTransactions(centerA, { limit: "50" });
    assert(
      txns.items.length === 2 && txns.items.some((t) => t.id === txnA),
      "transactions list: A's ledger rows are readable in full",
    );
    assert(
      !txns.items.some((t) => t.refNumber === `TXN-${tag}-B`),
      "transactions list: center B's row is NOT visible under center A",
    );
    const pays = await centerPayments(centerA);
    assert(pays.data.some((p) => p.id === paymentA), "payments list: readable");
    const pos = await centerPayouts(centerA);
    assert(pos.data.some((p) => p.id === payoutA), "payouts list: readable");
    const sets = await centerSettlements(centerA);
    assert(sets.data.some((s) => s.id === settlementA), "settlements list: readable");
    const wal = await centerWalletMovements(centerA);
    assert(wal.data.some((w) => w.id === walletA), "wallet movements: readable");
    const walRoster = await centerWalletMovements(centerA, { scope: "roster" });
    assert(walRoster.scope === "roster" && walRoster.total >= 1, "wallet movements: roster scope works");

    section("PART 2 — control ops, each writing exactly one audit row");
    const auditCount = async (action: string, targetId: string) =>
      (
        await admin.query(
          `SELECT count(*)::int AS n FROM audit_logs WHERE action=$1 AND target_id=$2 AND actor_id=$3`,
          [action, targetId, superAdminId],
        )
      ).rows[0].n as number;
    const lastAudit = async (action: string, targetId: string) =>
      (
        await admin.query(
          `SELECT * FROM audit_logs WHERE action=$1 AND target_id=$2 ORDER BY created_at DESC LIMIT 1`,
          [action, targetId],
        )
      ).rows[0];

    const upd = await updateCenterProfile(
      centerA,
      { name: `${tag}-centerA-renamed`, phone: "0111222333", area: "Maadi" },
      actor,
    );
    assert(upd.changed.length === 3, "profile edit: three fields changed");
    const profAudit = await lastAudit("center.profile_updated", centerA);
    assert(!!profAudit, "profile edit: an audit row was written");
    assert(profAudit.actor_id === superAdminId, "audit: WHO — the acting super admin");
    assert(profAudit.center_id === centerA, "audit: scoped to the center");
    assert(
      profAudit.before_state?.name === `${tag}-centerA` &&
        profAudit.after_state?.name === `${tag}-centerA-renamed`,
      "audit: BEFORE and AFTER both recorded, field by field",
    );
    assert(!!profAudit.created_at, "audit: WHEN — a timestamp");
    assert(profAudit.on_behalf_of === null, "audit: on_behalf_of NULL — a super admin acts as themselves");

    const illegal = await rejects(
      () =>
        updateCenterProfile(
          centerA,
          { walletBalance: 999_999 } as never,
          actor,
        ),
      /not editable here/i,
    );
    assert(illegal.threw && illegal.matched, "profile edit REFUSES walletBalance at the service layer");
    for (const field of ["status", "shortId", "receiptSeq", "splitCenterBp", "centerShare"]) {
      const r = await rejects(
        () => updateCenterProfile(centerA, { [field]: 1 } as never, actor),
        /not editable here/i,
      );
      assert(r.threw && r.matched, `profile edit REFUSES '${field}'`);
    }
    const walletAfterEdit = (
      await admin.query(`SELECT wallet_balance FROM centers WHERE id=$1`, [centerA])
    ).rows[0].wallet_balance;
    assert(Number(walletAfterEdit) === 0, "profile edit left the center wallet balance untouched");

    await updateCenterRoomProfile(centerA, roomA, { name: "Hall One (renamed)", price: 27_500 }, actor);
    const roomAudit = await lastAudit("center.room_updated", roomA);
    assert(
      roomAudit?.before_state?.name === "Hall One" && roomAudit?.after_state?.price === 27500,
      "room edit: audited with before/after",
    );

    section("C-03 — deactivation cuts access on the NEXT request");
    const authTeacher = await signInDoor(`${tag}-teacherA@edura.test`, PW);
    assert(
      !authTeacher.ok && authTeacher.message === "Invalid email or password",
      "www teacher is refused by the BACK-OFFICE login door — one generic H5 failure (unchanged)",
    );

    const superAuth = await signInDoor(`${tag}-super@edura.test`, PW);
    assert(superAuth.ok, "the super admin signs in through the full better-auth door");
    if (!superAuth.ok) throw new Error("cannot continue without a super admin session");
    assert(
      (await sessionFor(superAuth.cookie))?.userId === superAdminId,
      "baseline: the super admin's own session is live",
    );

    const verOf = async (id: string) =>
      Number((await admin.query(`SELECT token_version FROM users WHERE id=$1`, [id])).rows[0].token_version);
    assert((await verOf(teacherA)) === 0, "baseline: teacher epoch at 0");

    const deact = await setCenterMemberStatus(centerA, teacherA, "teacher", "deactivate", "Proof run", actor);
    assert(deact.status === "suspended", "teacher deactivated");
    assert((await verOf(teacherA)) === 1, "C-03: the status change bumped token_version in the same statement");
    const teacherStatus = (await admin.query(`SELECT status FROM users WHERE id=$1`, [teacherA])).rows[0].status;
    assert(teacherStatus === "suspended", "C-03: the users row reads suspended");
    assert(await auditCount("user.deactivated", teacherA) === 1, "audit: exactly one user.deactivated row");
    const deactAudit = await lastAudit("user.deactivated", teacherA);
    assert(
      deactAudit.before_state?.status === "active" &&
        deactAudit.after_state?.status === "suspended" &&
        deactAudit.after_state?.reason === "Proof run",
      "audit: before/after status + the required reason",
    );
    assert(deactAudit.center_id === centerA, "audit: the deactivation is attributed to this center");

    const enrStillActive = Number(
      (await admin.query(`SELECT count(*)::int AS n FROM enrollments WHERE course_id=$1 AND status='active'`, [courseA1]))
        .rows[0].n,
    );
    assert(enrStillActive === 2, "C-03: deactivating a teacher removed NO enrollments");

    await admin.query(`UPDATE users SET status='active' WHERE id=$1`, [studentA]);
    await plantSession(studentA);
    assert((await sessionRowsOf(studentA)) === 1, "baseline: the student holds a live session row");
    await setCenterMemberStatus(centerA, studentA, "student", "deactivate", "Proof run", actor);
    assert(
      (await sessionRowsOf(studentA)) === 0,
      "C-03: a session issued BEFORE the deactivation is hard-deleted — the very next request is unauthenticated",
    );
    await setCenterMemberStatus(centerA, studentA, "student", "activate", undefined, actor);
    assert(
      (await admin.query(`SELECT status FROM users WHERE id=$1`, [studentA])).rows[0].status === "active",
      "C-03: reactivation restores the account",
    );
    assert(
      (await sessionRowsOf(studentA)) === 0,
      "C-03: reactivation does NOT resurrect the revoked session — they log in fresh",
    );
    assert(
      (await sessionFor(superAuth.cookie))?.userId === superAdminId,
      "control: the acting super admin's own session is never disturbed",
    );

    const wrongCenter = await rejects(
      () => setCenterMemberStatus(centerB, studentA, "student", "deactivate", "x", actor),
      /not on this center's roster/i,
    );
    assert(wrongCenter.threw && wrongCenter.matched, "member ops are scoped: A's student is unreachable via center B");

    await plantSession(adminA); // center_admin is a www role too — same table
    await setCenterStatus(centerA, "deactivate", "Proof run", actor);
    assert(
      (await admin.query(`SELECT status FROM centers WHERE id=$1`, [centerA])).rows[0].status === "suspended",
      "center deactivated",
    );
    assert(
      (await admin.query(`SELECT status FROM users WHERE id=$1`, [adminA])).rows[0].status === "suspended",
      "center deactivation cascaded to its center_admin",
    );
    assert((await verOf(adminA)) === 1, "C-03: the cascade updateMany bumped the admin's epoch too");
    assert((await sessionRowsOf(adminA)) === 0, "C-03: the center admin's live session is cut (row deleted)");
    assert(await auditCount("center.deactivated", centerA) === 1, "audit: exactly one center.deactivated row");

    await setCenterStatus(centerA, "activate", undefined, actor);
    assert(
      (await admin.query(`SELECT status FROM users WHERE id=$1`, [adminA])).rows[0].status === "active",
      "reactivating the center restores its admins (the H-05 lockout shape is avoided)",
    );
    assert(await auditCount("center.activated", centerA) === 1, "audit: one center.activated row");

    section("H-04 — enrollment removal is journalled and reversible");
    await removeStudentFromCenter(centerA, studentA, "Proof run", actor);
    const removedRows = (
      await admin.query(
        `SELECT id, status FROM enrollments WHERE student_id=$1 ORDER BY id`,
        [studentA],
      )
    ).rows;
    const byId = new Map(removedRows.map((r) => [r.id, r.status]));
    assert(
      byId.get(enrA1) === "unenrolled" && byId.get(enrA2) === "unenrolled",
      "H-04: both of A's enrollments were withdrawn",
    );
    assert(byId.get(enrB) === "active", "H-04: the SAME student's enrollment at center B is untouched");
    const journal = (
      await admin.query(
        `SELECT bca.entity_id, bca.reversed_at FROM blacklist_cascade_actions bca
         WHERE bca.target_id=$1 ORDER BY bca.applied_at DESC`,
        [studentA],
      )
    ).rows;
    assert(journal.length === 2, "H-04: one journal row per withdrawn enrollment");
    assert(journal.every((j) => j.reversed_at === null), "H-04: journal rows are outstanding");
    const remAudit = await lastAudit("center.student_removed", studentA);
    assert(
      remAudit?.center_id === centerA && Array.isArray(remAudit.after_state?.cascadeJournal),
      "audit: the removal records the journal that makes it reversible",
    );

    await restoreStudentToCenter(centerA, studentA, "Proof run reversal", actor);
    const restoredRows = (
      await admin.query(`SELECT id, status FROM enrollments WHERE student_id=$1`, [studentA])
    ).rows;
    assert(
      restoredRows.every((r) => r.status === "active"),
      "H-04: the lift replayed the journal — every withdrawn enrollment is back",
    );
    assert(
      Number(
        (await admin.query(`SELECT count(*)::int AS n FROM enrollments WHERE student_id=$1`, [studentA]))
          .rows[0].n,
      ) === 3,
      "H-04: restore reactivated the ORIGINAL rows — no duplicates were inserted",
    );
    assert(!!(await lastAudit("center.student_restored", studentA)), "audit: the restore is recorded too");

    section("Approve / reject a pending item");
    const decided = await decideCollaborationRequest(collabId, "approve", {}, actor);
    assert(decided.status === "accepted", "collaboration request approved on behalf of the platform");
    const newCourse = (
      await admin.query(`SELECT id, center_id, teacher_id, pricing_method FROM courses WHERE id=$1`, [
        decided.courseId,
      ])
    ).rows[0];
    assert(
      newCourse.center_id === centerA && newCourse.teacher_id === teacherB,
      "approval created the course through the SAME transaction the parties use",
    );
    const genSessions = Number(
      (await admin.query(`SELECT count(*)::int AS n FROM sessions WHERE course_id=$1`, [decided.courseId]))
        .rows[0].n,
    );
    assert(genSessions > 0, "approval generated the schedule");
    const affNow = (
      await admin.query(
        `SELECT status, center_share FROM center_teacher_affiliations WHERE center_id=$1 AND teacher_id=$2`,
        [centerA, teacherB],
      )
    ).rows[0];
    assert(affNow.status === "active", "approval created the affiliation");
    assert(
      Number(affNow.center_share) === 0,
      "approval wrote NO money value onto the affiliation (superadmin config owns it)",
    );
    const collabAudit = await lastAudit("collaboration_request.approved", collabId);
    assert(
      collabAudit?.before_state?.status === "pending" &&
        collabAudit?.after_state?.decidedBy === "platform_override",
      "audit: the approval records before/after and that it was a platform override",
    );

    const notSuper = await rejects(
      () =>
        decideCollaborationRequest(
          collabId,
          "reject",
          { reason: "x" },
          { id: adminA, role: "center_admin", centerId: centerA } as SessionUser,
        ),
      /super admin/i,
    );
    assert(notSuper.threw && notSuper.matched, "the platform override is default-closed to non-super_admins");

    section("MONEY — the super admin is NOT exempt from the ledger guarantees");
    const viaApp = (fn: (tx: never) => Promise<unknown>) => () => withPlatformContext(fn as never);

    const l1 = [
      ["Transaction.update", viaApp((tx: never) =>
        (tx as { transaction: { update: (a: unknown) => Promise<unknown> } }).transaction.update({
          where: { id: txnA }, data: { amount: 1 },
        }))],
      ["Transaction.delete", viaApp((tx: never) =>
        (tx as { transaction: { delete: (a: unknown) => Promise<unknown> } }).transaction.delete({
          where: { id: txnA },
        }))],
      ["PointsLedger.update", viaApp((tx: never) =>
        (tx as { pointsLedger: { update: (a: unknown) => Promise<unknown> } }).pointsLedger.update({
          where: { id: pointsA }, data: { delta: 9999 },
        }))],
      ["WalletLedger.update", viaApp((tx: never) =>
        (tx as { walletLedger: { update: (a: unknown) => Promise<unknown> } }).walletLedger.update({
          where: { id: walletA }, data: { delta: 1 },
        }))],
      ["SessionSettlement.update", viaApp((tx: never) =>
        (tx as { sessionSettlement: { update: (a: unknown) => Promise<unknown> } }).sessionSettlement.update({
          where: { id: settlementA }, data: { centerTotal: 1 },
        }))],
    ] as const;
    for (const [label, fn] of l1) {
      const r = await rejects(fn as () => Promise<unknown>, /append-only/i);
      assert(r.threw && r.matched, `runtime layer: ${label} is refused ("${r.message.slice(0, 48)}…")`);
    }
    for (const [label, model, id] of [
      ["Invoice.delete", "invoice", invoiceA],
      ["Payout.delete", "payout", payoutA],
    ] as const) {
      const r = await rejects(
        viaApp((tx: never) =>
          (tx as Record<string, { delete: (a: unknown) => Promise<unknown> }>)[model].delete({
            where: { id },
          }),
        ),
        /must not be hard-deleted/i,
      );
      assert(r.threw && r.matched, `runtime layer: ${label} is refused`);
    }

    const appRole = (
      await admin.query<{ role: string }>(
        `SELECT rolname AS role FROM pg_roles WHERE rolname = 'edura_app'`,
      )
    ).rows[0];
    assert(!!appRole, "the application DB role edura_app exists");

    const appPool = testPool(process.env.DATABASE_URL);

    const rawAsApp = async (sql: string, params: unknown[] = []) => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
        await client.query(sql, params);
        return { threw: false, message: "(succeeded — THE LEDGER IS WRITABLE)" };
      } catch (e) {
        return { threw: true, message: (e as { message?: string })?.message ?? String(e) };
      } finally {
        await client.query("ROLLBACK").catch(() => {});
        client.release();
      }
    };
    const whoami = (await appPool.query(`SELECT current_user AS u`)).rows[0].u;
    assert(whoami === "edura_app", `the oversight app connects as '${whoami}' — the ordinary app role`);
    assert(
      (await appPool.query(`SELECT current_setting('app.bypass_rls', true) AS v`)).rows[0].v !== "on",
      "the RLS-bypass GUC does not leak out of a probe (pooled connections are shared)",
    );

    const dbAttempts: [string, string, unknown[]][] = [
      ["UPDATE transactions", `UPDATE transactions SET amount = 1 WHERE id = $1`, [txnA]],
      ["DELETE transactions", `DELETE FROM transactions WHERE id = $1`, [txnA]],
      ["UPDATE points_ledger", `UPDATE points_ledger SET delta = 9999 WHERE id = $1`, [pointsA]],
      ["DELETE points_ledger", `DELETE FROM points_ledger WHERE id = $1`, [pointsA]],
      ["UPDATE session_settlements", `UPDATE session_settlements SET center_total = 1 WHERE id = $1`, [settlementA]],
      ["DELETE session_settlements", `DELETE FROM session_settlements WHERE id = $1`, [settlementA]],
      ["DELETE invoices", `DELETE FROM invoices WHERE id = $1`, [invoiceA]],
      ["DELETE payouts", `DELETE FROM payouts WHERE id = $1`, [payoutA]],
      ["UPDATE audit_logs", `UPDATE audit_logs SET action = 'tampered' WHERE center_id = $1`, [centerA]],
      ["DELETE audit_logs", `DELETE FROM audit_logs WHERE center_id = $1`, [centerA]],
    ];
    for (const [label, sql, params] of dbAttempts) {
      const r = await rawAsApp(sql, params);
      assert(
        r.threw && /permission denied/i.test(r.message),
        `DB layer: ${label} → ${r.threw ? r.message.split("\n")[0] : r.message}`,
      );
    }

    const neg = await rawAsApp(`UPDATE centers SET wallet_balance = -1 WHERE id = $1`, [centerA]);
    assert(
      neg.threw && /wallet_balance|check constraint/i.test(neg.message),
      `DB layer: a negative center wallet balance is rejected → ${neg.message.split("\n")[0]}`,
    );
    const wlRaw = await rawAsApp(`UPDATE wallet_ledger SET delta = delta WHERE id = $1`, [walletA]);
    console.log(
      `  ℹ wallet_ledger DB-level UPDATE ${wlRaw.threw ? "is revoked" : "is NOT revoked (runtime extension only — known, deliberate)"}`,
    );
    await appPool.end();

    const after = await moneySnapshot([centerA, centerB], [studentA, studentA2, studentB]);
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      assert(
        JSON.stringify(before[key]) === JSON.stringify(after[key]),
        `money witness: ${key} is byte-identical before and after the entire oversight run`,
      );
    }
    console.log(`  (witness covers ${MONEY_TABLES.join(", ")})`);

    section("Audit log viewer");
    const log = await listAuditLogs({ centerId: centerA, limit: "100" });
    const actions = new Set(log.data.map((r) => r.action));
    for (const a of [
      "center.profile_updated",
      "center.room_updated",
      "center.deactivated",
      "center.activated",
      "user.deactivated",
      "user.activated",
      "center.student_removed",
      "center.student_restored",
      "collaboration_request.approved",
    ]) {
      assert(actions.has(a), `audit viewer surfaces '${a}'`);
    }
    assert(
      log.data.every((r) => r.centerId === centerA),
      "audit viewer: the center filter is honoured",
    );
    assert(
      log.data.every((r) => r.actorName !== null || r.actorId === null),
      "audit viewer: actors are resolved to names",
    );
  } finally {
    const u = created.users;
    const c = created.centers;
    const courses = (
      await admin.query(`SELECT id FROM courses WHERE center_id = ANY($1::uuid[]) OR teacher_id = ANY($2::uuid[])`, [c, u])
    ).rows.map((r) => r.id);
    await admin.query(`DELETE FROM attendance_records WHERE course_id = ANY($1::uuid[])`, [courses]);
    await admin.query(`DELETE FROM session_settlements WHERE center_id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM sessions WHERE course_id = ANY($1::uuid[])`, [courses]);
    await admin.query(`DELETE FROM subscriptions WHERE center_id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM enrollments WHERE student_id = ANY($1::uuid[])`, [u]);
    await admin.query(`DELETE FROM collaboration_requests WHERE center_id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM blacklist_cascade_actions WHERE target_id = ANY($1::uuid[])`, [u]);
    await admin.query(`DELETE FROM blacklist_entries WHERE target_id = ANY($1::uuid[])`, [u]);
    await admin.query(`DELETE FROM wallet_ledger WHERE student_id = ANY($1::uuid[])`, [u]);
    await admin.query(`DELETE FROM points_ledger WHERE student_id = ANY($1::uuid[])`, [u]);
    await admin.query(`DELETE FROM invoices WHERE center_id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM payouts WHERE center_id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM payments WHERE center_id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM transactions WHERE center_id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [courses]);
    await admin.query(`DELETE FROM rooms WHERE center_id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM center_staff WHERE center_id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM center_student_rosters WHERE center_id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM center_teacher_affiliations WHERE center_id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM center_admin_profiles WHERE center_id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [u]);
    await admin.query(`DELETE FROM teacher_profiles WHERE user_id = ANY($1::uuid[])`, [u]);
    await admin.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [u]);
    await admin.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[]) OR center_id = ANY($2::uuid[])`, [u, c]);
    await admin.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [c]);
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [u]);
    await admin.end();
    await prisma.$disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite center-oversight.test.ts" })
  .then(() => main()).catch((e) => {
  console.error(e);
  process.exit(1);
});
