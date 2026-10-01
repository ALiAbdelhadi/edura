import { testPool } from "../../../../packages/database/scripts/test-pool";
import bcrypt from "bcryptjs";
import { prisma } from "@repo/database";
import {
  teacherAssistants,
  teacherAttendance,
  teacherAuditLog,
  teacherCenters,
  teacherCourses,
  teacherEnrollments,
  teacherFinanceSummary,
  teacherOverview,
  teacherPayouts,
  teacherSessions,
  teacherSettlements,
  teacherStudents,
  teacherSubscriptions,
  teacherTransactions,
} from "@repo/server-core/backoffice/admin/teacher-oversight";

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
  const tag = "tovs-" + Math.floor(Math.random() * 1e9).toString(36);
  const hash = await bcrypt.hash("Passw0rd!TOVS", 10);
  const users: string[] = [];
  const centers: string[] = [];
  const courses: string[] = [];

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
  const mkCourse = async (key: string, teacherId: string, centerId: string | null) => {
    const id = (
      await q(
        `INSERT INTO courses
           (center_id, teacher_id, title, subject, days_of_week, start_time, end_time,
            start_date, price, max_students, status, is_demo, updated_at)
         VALUES ($1,$2,$3,'math','{1,3}','16:00','18:00', now(), 20000, 30, 'active', true, now())
         RETURNING id`,
        [centerId, teacherId, `${tag}-${key}`],
      )
    )[0].id as string;
    courses.push(id);
    return id;
  };

  try {
    console.log(`TEACHER OVERSIGHT — the read surface — ${tag}`);

    const teacher = await mkUser("teacher", "teacher");
    const otherTeacher = await mkUser("other", "teacher");
    const student = await mkUser("student", "student");
    const otherStudent = await mkUser("student2", "student");
    const assistant = await mkUser("assistant", "assistant");
    const superAdminId = await mkUser("super", "super_admin");

    await q(
      `INSERT INTO teacher_profiles (user_id, subjects, experience_years, wallet_balance, updated_at)
       VALUES ($1,'{math}',5, 12345, now())`,
      [teacher],
    );
    await q(
      `INSERT INTO teacher_profiles (user_id, subjects, updated_at) VALUES ($1,'{math}',now())`,
      [otherTeacher],
    );
    await q(
      `INSERT INTO student_profiles (user_id, full_name, family_link_code, updated_at)
       VALUES ($1,$3,$5,now()), ($2,$4,$6,now())`,
      [
        student,
        otherStudent,
        `${tag}-student`,
        `${tag}-student2`,
        `${tag}FL1`.toUpperCase().slice(0, 20),
        `${tag}FL2`.toUpperCase().slice(0, 20),
      ],
    );

    const centerA = await mkCenter("A");
    const courseMine = await mkCourse("mine", teacher, centerA);
    const courseDirect = await mkCourse("direct", teacher, null);
    const courseTheirs = await mkCourse("theirs", otherTeacher, centerA);

    await q(
      `INSERT INTO center_teacher_affiliations (center_id, teacher_id, status, expires_at, updated_at)
       VALUES ($1,$2,'active', now() + interval '30 days', now())`,
      [centerA, teacher],
    );
    await q(
      `INSERT INTO teacher_assistants (teacher_id, assistant_id, title, updated_at)
       VALUES ($1,$2,'Lab assistant',now())`,
      [teacher, assistant],
    );
    await q(
      `INSERT INTO enrollments (student_id, course_id, center_id, status, enrolled_by, updated_at)
       VALUES ($1,$2,$3,'active',$7,now()),
              ($1,$4,NULL,'active',$7,now()),
              ($5,$6,$3,'active',$7,now())`,
      [student, courseMine, centerA, courseDirect, otherStudent, courseTheirs, superAdminId],
    );

    const sessionMine = (
      await q(
        `INSERT INTO sessions
           (course_id, teacher_id, original_date, date, start_time, end_time, status, updated_at)
         VALUES ($1,$2, now(), now(), '16:00','18:00','scheduled', now()) RETURNING id`,
        [courseMine, teacher],
      )
    )[0].id as string;
    await q(
      `INSERT INTO sessions
         (course_id, teacher_id, original_date, date, start_time, end_time, status, updated_at)
       VALUES ($1,$2, now(), now(), '16:00','18:00','scheduled', now())`,
      [courseTheirs, otherTeacher],
    );
    await q(
      `INSERT INTO attendance_records
         (session_id, student_id, course_id, center_id, status, marked_by, updated_at)
       VALUES ($1,$2,$3,$4,'present',$5, now())`,
      [sessionMine, student, courseMine, centerA, superAdminId],
    );

    // ── SCOPE ─────────────────────────────────────────────────────────────
    section("every reader is scoped to this teacher");

    const overview = await teacherOverview(teacher);
    assert(overview.teacher.id === teacher, "the overview returns the teacher");
    assert(overview.counts.courses === 2, "…counts only their own courses (2 of 3)");
    assert(
      overview.counts.students === 1,
      "…counts DISTINCT students across those courses, not enrollments (1, not 2)",
    );
    assert(overview.counts.centers === 1, "…counts their active affiliations");
    assert(overview.counts.assistants === 1, "…and their assistants");
    assert(overview.profile?.walletBalance === 12345, "…and carries the profile it found");

    const coursesOut = await teacherCourses(teacher);
    assert(coursesOut.total === 2, "courses: the other teacher's course is not there");
    assert(
      coursesOut.data.some((c) => c.id === courseDirect && c.centerId === null),
      "…and a teacher-direct course (null centre) is included, not filtered out as broken",
    );

    const sessionsOut = await teacherSessions(teacher);
    assert(sessionsOut.total === 1, "sessions: only the session this teacher is on");
    assert(
      sessionsOut.data[0]?.courseTitle === `${tag}-mine`,
      "…hydrated with its course title",
    );

    const studentsOut = await teacherStudents(teacher);
    assert(studentsOut.total === 1, "students: distinct, and the other teacher's is excluded");
    assert(studentsOut.data[0]?.id === student, "…and it is the right student");
    assert(
      (studentsOut.data[0]?.courses as unknown[]).length === 2,
      "…listing both of this teacher's courses they are on",
    );

    // The tag carries a hyphen, which the haystack normalizer turns into a
    // space — so this only passes if the TERM is normalized too, which is the
    // bug this assertion was written to catch.
    const searchHit = await teacherStudents(teacher, { q: `${tag}-student` });
    assert(searchHit.total === 1, "the student search normalizes the term like the haystack");
    const searchMiss = await teacherStudents(teacher, { q: "zzz-no-such-student" });
    assert(searchMiss.total === 0, "…and a miss returns nothing rather than everything");

    const enrollmentsOut = await teacherEnrollments(teacher);
    assert(enrollmentsOut.total === 2, "enrollments: both of this teacher's, none of theirs");

    const attendanceOut = await teacherAttendance(teacher);
    assert(attendanceOut.total === 1, "attendance: scoped through the teacher's courses");
    assert(
      attendanceOut.byStatus.some((s) => s.status === "present" && s.count === 1),
      "…with a status breakdown beside the rows",
    );

    const centersOut = await teacherCenters(teacher);
    assert(centersOut.total === 1, "centres: the affiliation is there");
    assert(centersOut.data[0]?.centerName === `${tag}-A`, "…named, not just an id");
    assert(centersOut.data[0]?.courses === 1, "…with the course count at that centre");

    const assistantsOut = await teacherAssistants(teacher);
    assert(assistantsOut.total === 1, "assistants: the delegation link is there");
    assert(
      assistantsOut.data[0]?.assistantName === `${tag}-assistant`,
      "…with the assistant's name resolved",
    );

    // ── MONEY ─────────────────────────────────────────────────────────────
    section("the money readers read the ledger");

    await q(
      `INSERT INTO transactions (ref_number, type, amount, from_entity_id, to_entity_id, center_id, lesson_id, status)
       VALUES ($1,'payment', 20000, $2, $3, $4, $5, 'completed')`,
      [`${tag}-T1`, student, teacher, centerA, sessionMine],
    );
    await q(
      `INSERT INTO transactions (ref_number, type, amount, from_entity_id, to_entity_id, center_id, status)
       VALUES ($1,'commission', 3000, $2, NULL, $3, 'completed')`,
      [`${tag}-T2`, teacher, centerA],
    );
    await q(
      `INSERT INTO transactions (ref_number, type, amount, from_entity_id, to_entity_id, center_id, status)
       VALUES ($1,'payment', 9999, $2, $3, $4, 'completed')`,
      [`${tag}-T3`, otherStudent, otherTeacher, centerA],
    );
    await q(
      `INSERT INTO payouts (center_id, beneficiary_id, beneficiary_type, gross_amount, commission, net_payable, status)
       VALUES ($1,$2,'teacher', 20000, 3000, 17000, 'pending')`,
      [centerA, teacher],
    );
    await q(
      `INSERT INTO session_settlements
         (session_id, course_id, center_id, teacher_id, present_count, per_session_price,
          platform_total, center_total, teacher_total, settled_by)
       VALUES ($1,$2,$3,$4, 1, 20000, 1000, 2000, 17000, $5)`,
      [sessionMine, courseMine, centerA, teacher, superAdminId],
    );

    const txns = await teacherTransactions(teacher);
    assert(txns.total === 2, "transactions: both directions, and only this teacher's");
    assert(
      txns.data.some((t) => t.type === "payment" && t.direction === "in"),
      "…money reaching them is marked `in`",
    );
    assert(
      txns.data.some((t) => t.type === "commission" && t.direction === "out"),
      "…and commission leaving them is marked `out`",
    );
    assert(
      !txns.data.some((t) => t.refNumber === `${tag}-T3`),
      "…the other teacher's payment is not in this teacher's ledger",
    );

    const money = await teacherFinanceSummary(teacher);
    assert(money.walletBalance === 12345, "the summary reads the wallet from the profile");
    assert(money.earned === 20000, "…earnings from the ledger");
    assert(money.commission === 3000, "…commission from the ledger");
    assert(
      money.pendingPayouts.amount === 17000 && money.pendingPayouts.count === 1,
      "…and the pending payout from `net_payable`, not a re-derived figure",
    );
    assert(money.settled.amount === 17000, "…settled from session_settlements.teacher_total");

    const payoutsOut = await teacherPayouts(teacher);
    assert(payoutsOut.total === 1, "payouts: scoped by beneficiary AND beneficiary type");

    const settlementsOut = await teacherSettlements(teacher);
    assert(settlementsOut.total === 1, "settlements: this teacher's only");
    assert(
      settlementsOut.data[0]?.courseTitle === `${tag}-mine`,
      "…hydrated with the course it settled",
    );

    // `subs_target_shape` requires center_id IS NULL when the target is the
    // teacher — a teacher-direct subscription belongs to no centre.
    await q(
      `INSERT INTO subscriptions
         (student_id, target_type, teacher_id, center_id, course_id, plan, price,
          status, source, activated_at, updated_at)
       VALUES ($1,'teacher',$2,NULL,$3,'monthly', 20000, 'active', 'online', now(), now())`,
      [student, teacher, courseMine],
    );
    const subsOut = await teacherSubscriptions(teacher);
    assert(subsOut.total === 1, "subscriptions: scoped by teacher_id");
    assert(
      subsOut.totals.some((t) => t.status === "active" && t.count === 1),
      "…with a per-status roll-up beside the rows",
    );

    // ── AUDIT ─────────────────────────────────────────────────────────────
    section("audit");
    await q(
      `INSERT INTO audit_logs (actor_id, action, target_type, target_id, after_state)
       VALUES ($1,'teacher.profile_updated','teacher',$2,'{"name":"x"}'::jsonb),
              ($1,'user.suspended','user',$2,'{"status":"suspended"}'::jsonb),
              ($1,'center.approved','center',$3,'{}'::jsonb)`,
      [superAdminId, teacher, centerA],
    );
    const auditOut = await teacherAuditLog(teacher);
    assert(auditOut.total === 2, "the audit tab shows BOTH teacher- and user-shaped entries");
    assert(
      auditOut.data.every((a) => a.action !== "center.approved"),
      "…and nothing aimed at another entity",
    );
    assert(
      auditOut.data[0]?.actorName === `${tag}-super`,
      "…with the actor resolved to a name",
    );

    // ── REFUSALS ──────────────────────────────────────────────────────────
    section("a non-teacher is not reachable through this surface");
    for (const [name, fn] of [
      ["teacherOverview", () => teacherOverview(student)],
      ["teacherCourses", () => teacherCourses(student)],
      ["teacherFinanceSummary", () => teacherFinanceSummary(student)],
      ["teacherAuditLog", () => teacherAuditLog(student)],
    ] as const) {
      const r = await rejects(fn, /Teacher not found/i);
      assert(r.threw && r.matched, `${name} refuses a student id`);
    }
  } finally {
    const u = users;
    const c = centers;
    await q(`DELETE FROM session_settlements WHERE teacher_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM payouts WHERE beneficiary_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM transactions WHERE center_id = ANY($1::uuid[])`, [c]);
    await q(`DELETE FROM subscriptions WHERE teacher_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM attendance_records WHERE course_id = ANY($1::uuid[])`, [courses]);
    await q(`DELETE FROM enrollments WHERE course_id = ANY($1::uuid[])`, [courses]);
    await q(`DELETE FROM sessions WHERE course_id = ANY($1::uuid[])`, [courses]);
    await q(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [courses]);
    await q(`DELETE FROM teacher_assistants WHERE teacher_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM center_teacher_affiliations WHERE center_id = ANY($1::uuid[])`, [c]);
    await q(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[]) OR center_id = ANY($2::uuid[])`, [u, c]);
    await q(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM teacher_profiles WHERE user_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [c]);
    await q(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [u]);
    await admin.end();
    await prisma.$disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite teacher-oversight.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
