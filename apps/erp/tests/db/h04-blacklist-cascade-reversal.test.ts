import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext } from "@repo/database";
import {
  assertNotBlacklisted,
  platformBlacklistUser,
  centerBlacklistStudent,
  teacherBlacklistStudent,
  removeBlacklistEntry,
} from "@repo/server-core/services/blacklist/blacklist";
import type { SessionUser } from "@/lib/auth/session";

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
async function expectThrows(fn: () => Promise<unknown>, label: string) {
  try {
    await fn();
    assert(false, `${label} (did not throw)`);
  } catch (e) {
    assert(true, `${label} (threw: ${(e as Error).message.slice(0, 70)})`);
  }
}

const rid = () => Math.floor(Math.random() * 1e9).toString(36);
const tag = "h04-" + rid();

const MONEY_TABLES = [
  "transactions",
  "payments",
  "payment_intents",
  "wallet_ledger",
  "subscriptions",
  "session_settlements",
  "payouts",
  "invoices",
  "points_ledger",
];

type Snapshot = Record<string, Map<string, { h: string; raw: string }>>;

async function moneyWitness(): Promise<Snapshot> {
  const out: Snapshot = {};
  for (const t of MONEY_TABLES) {
    const r = await admin.query(`SELECT id::text AS id, md5(t::text) AS h, t::text AS raw FROM "${t}" t`);
    out[t] = new Map(r.rows.map((x) => [x.id, { h: x.h, raw: x.raw }]));
  }
  const w = await admin.query(
    `SELECT 'teacher:' || id AS k, wallet_balance::text AS v FROM teacher_profiles
     UNION ALL SELECT 'center:' || id, wallet_balance::text FROM centers
     UNION ALL SELECT 'student:' || id, wallet_balance::text FROM student_profiles`,
  );
  out.__wallets = new Map(w.rows.map((x) => [x.k, { h: x.v, raw: x.v }]));
  return out;
}

function moneyViolations(before: Snapshot, after: Snapshot, fixtureIds: string[]) {
  const bad: string[] = [];
  for (const t of Object.keys(before)) {
    for (const [id, row] of before[t]) {
      const now = after[t].get(id);
      if (!now) bad.push(`${t}:${id.slice(0, 12)} DELETED`);
      else if (now.h !== row.h) bad.push(`${t}:${id.slice(0, 12)} MODIFIED`);
    }
    for (const [id, row] of after[t]) {
      if (before[t].has(id)) continue;
      if (fixtureIds.some((f) => id.includes(f) || row.raw.includes(f))) {
        bad.push(`${t}:${id.slice(0, 12)} CREATED for a fixture entity`);
      }
    }
  }
  return bad;
}

type Fx = Awaited<ReturnType<typeof seed>>;

async function seed() {
  return withPlatformContext(async (tx) => {
    const superAdmin = await tx.user.create({
      data: { name: `${tag}-sa`, role: "super_admin", email: `${tag}-sa@x.io`, status: "active", isDemo: true },
    });

    const mkStudent = async (k: string) => {
      const u = await tx.user.create({
        data: { name: `${tag}-${k}`, role: "student", email: `${tag}-${k}@x.io`, status: "active", isDemo: true },
      });
      await tx.studentProfile.create({
        data: { userId: u.id, fullName: `${tag}-${k}`, familyLinkCode: (tag + k).slice(0, 18), pointsBalance: 0 },
      });
      return u.id;
    };

    const mkCenter = async (k: string) => {
      const c = await tx.center.create({
        data: {
          name: `${tag}-${k}`,
          shortId: ("C" + rid() + rid()).slice(0, 12).toUpperCase(),
          status: "active",
          walletBalance: 0,
          isDemo: true,
        },
      });
      const adminUser = await tx.user.create({
        data: { name: `${tag}-${k}-admin`, role: "center_admin", email: `${tag}-${k}-adm@x.io`, status: "active", isDemo: true },
      });
      await tx.centerAdminProfile.create({ data: { userId: adminUser.id, centerId: c.id } });
      return { centerId: c.id, adminId: adminUser.id };
    };

    const mkTeacher = async (k: string) => {
      const u = await tx.user.create({
        data: { name: `${tag}-${k}`, role: "teacher", email: `${tag}-${k}@x.io`, status: "active", isDemo: true },
      });
      await tx.teacherProfile.create({ data: { userId: u.id, bio: k, walletBalance: 0 } });
      return u.id;
    };

    const mkCourse = async (k: string, centerId: string | null, teacherId: string, maxStudents = 30) =>
      (
        await tx.course.create({
          data: {
            centerId,
            teacherId,
            title: `${tag}-${k}`,
            subject: "math",
            daysOfWeek: [1],
            startTime: "10:00",
            endTime: "11:00",
            startDate: new Date(),
            price: 0,
            maxStudents,
            status: "active",
            isDemo: true,
          },
        })
      ).id;

    const student = await mkStudent("stu");
    const control = await mkStudent("ctl");
    const A = await mkCenter("A");
    const B = await mkCenter("B");
    const C = await mkCenter("C");
    const tA1 = await mkTeacher("tA1");
    const tA2 = await mkTeacher("tA2");
    const tB = await mkTeacher("tB");
    const tD = await mkTeacher("tD");

    const courses = {
      a1: await mkCourse("a1", A.centerId, tA1),
      a2: await mkCourse("a2", A.centerId, tA2),
      b1: await mkCourse("b1", B.centerId, tB),
      b2: await mkCourse("b2", B.centerId, tA1), // teacher A1 also teaches at B
      c1: await mkCourse("c1", C.centerId, tB),
      direct: await mkCourse("direct", null, tD), // teacher-direct, centerId NULL
      quit: await mkCourse("quit", A.centerId, tA1),
      ending: await mkCourse("ending", B.centerId, tB),
      full: await mkCourse("full", C.centerId, tB, 1),
    };

    for (const [k, courseId] of Object.entries(courses)) {
      const c = await tx.course.findUniqueOrThrow({ where: { id: courseId }, select: { centerId: true } });
      await tx.enrollment.create({
        data: { studentId: student, courseId, centerId: c.centerId, status: "active", enrolledBy: superAdmin.id },
      });
      if (k !== "full") {
        await tx.enrollment.create({
          data: { studentId: control, courseId, centerId: c.centerId, status: "active", enrolledBy: superAdmin.id },
        });
      }
    }

    for (const c of [A, B, C]) {
      await tx.centerStudentRoster.create({ data: { centerId: c.centerId, studentId: student } });
    }

    return { superAdmin: superAdmin.id, student, control, A, B, C, tA1, tA2, tB, tD, courses };
  });
}

async function teardown(fx: Fx) {
  const userIds = [fx.superAdmin, fx.student, fx.control, fx.A.adminId, fx.B.adminId, fx.C.adminId, fx.tA1, fx.tA2, fx.tB, fx.tD];
  const courseIds = Object.values(fx.courses);
  const centerIds = [fx.A.centerId, fx.B.centerId, fx.C.centerId];
  await admin.query(`DELETE FROM blacklist_cascade_actions WHERE target_id = ANY($1::uuid[])`, [userIds]);
  await admin.query(`DELETE FROM blacklist_entries WHERE target_id = ANY($1::uuid[])`, [userIds]);
  await admin.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await admin.query(`DELETE FROM enrollments WHERE course_id = ANY($1::uuid[])`, [courseIds]);
  await admin.query(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [courseIds]);
  await admin.query(`DELETE FROM center_student_rosters WHERE center_id = ANY($1::uuid[])`, [centerIds]);
  await admin.query(`DELETE FROM center_admin_profiles WHERE center_id = ANY($1::uuid[])`, [centerIds]);
  await admin.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[]) OR target_id = ANY($1::uuid[])`, [userIds]);
  await admin.query(`DELETE FROM teacher_profiles WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await admin.query(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
  await admin.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [centerIds]);
}

async function statuses(studentId: string, courses: Record<string, string>) {
  const r = await admin.query(
    `SELECT course_id, status FROM enrollments WHERE student_id = $1`,
    [studentId],
  );
  const byCourse = new Map<string, string[]>();
  for (const row of r.rows) {
    const list = byCourse.get(row.course_id) ?? [];
    list.push(row.status);
    byCourse.set(row.course_id, list);
  }
  const out: Record<string, string> = {};
  for (const [k, id] of Object.entries(courses)) out[k] = (byCourse.get(id) ?? []).sort().join("+") || "none";
  return out;
}

async function journal(entryId: string) {
  const r = await admin.query(
    `SELECT course_id, reversal, reversed_at FROM blacklist_cascade_actions WHERE entry_id = $1`,
    [entryId],
  );
  return r.rows as { course_id: string; reversal: string | null; reversed_at: Date | null }[];
}

const asSuper = (id: string): SessionUser => ({ id, role: "super_admin" }) as SessionUser;

async function main() {
  console.log("H-04 blacklist cascade reversal —", tag);
  const fx = await seed();
  const courses = fx.courses;
  const cascaded = ["a1", "a2", "b1", "b2", "c1", "direct"] as const;
  const fixtureIds = [
    fx.student, fx.control, fx.superAdmin, fx.tA1, fx.tA2, fx.tB, fx.tD,
    fx.A.centerId, fx.B.centerId, fx.C.centerId,
    fx.A.adminId, fx.B.adminId, fx.C.adminId,
    ...Object.values(courses),
  ];

  try {
    console.log("\n[1] PLATFORM — blacklist removes all, lift restores all, only those");

    await admin.query(
      `UPDATE enrollments SET status='unenrolled', unenrolled_at=now()
        WHERE student_id=$1 AND course_id=$2`,
      [fx.student, courses.quit],
    );

    const money0 = await moneyWitness();
    const before = await statuses(fx.student, courses);
    assert(
      cascaded.every((k) => before[k] === "active") && before.quit === "unenrolled",
      "setup: 6 cascaded enrollments active, 1 unrelated departure already unenrolled",
    );

    const pEntry = await platformBlacklistUser(fx.student, "H-04 platform test", fx.superAdmin);
    const afterBl = await statuses(fx.student, courses);
    assert(
      cascaded.every((k) => afterBl[k] === "unenrolled"),
      "platform blacklist unenrolled ALL 6 in-scope enrollments (incl. teacher-direct)",
    );
    const pJournal = await journal(pEntry.id);
    assert(pJournal.length === 8, `journal recorded every removal and only those (${pJournal.length} rows = 9 courses − 1 already gone)`);
    assert(
      !pJournal.some((j) => j.course_id === courses.quit),
      "the unrelated departure was NOT journaled (the blacklist did not cause it)",
    );
    const ctlDuring = await statuses(fx.control, courses);
    assert(
      Object.entries(ctlDuring).every(([k, v]) => (k === "full" ? v === "none" : v === "active")),
      "control student's enrollments untouched by another student's blacklist",
    );

    await admin.query(`UPDATE courses SET status='ended' WHERE id=$1`, [courses.ending]);
    await admin.query(
      `INSERT INTO enrollments (student_id, course_id, center_id, status, enrolled_by, updated_at)
       VALUES ($1, $2, $3, 'active', $4, now())`,
      [fx.control, courses.full, fx.C.centerId, fx.superAdmin],
    );

    await removeBlacklistEntry(pEntry.id, asSuper(fx.superAdmin), "lifted");
    const afterLift = await statuses(fx.student, courses);
    assert(
      cascaded.every((k) => afterLift[k] === "active"),
      "lift RESTORED all 6 blacklist-caused removals",
    );
    assert(
      afterLift.quit === "unenrolled",
      "the enrollment the student left for an UNRELATED reason is NOT restored",
    );
    assert(afterLift.ending === "unenrolled", "a course that ENDED while blacklisted is NOT restored");
    assert(afterLift.full === "active", "a course that FILLED UP is restored anyway (the seat was theirs)");

    const pJ2 = await journal(pEntry.id);
    assert(pJ2.every((j) => j.reversed_at !== null), "every journal row stamped with an outcome");
    const byCourse = new Map(pJ2.map((j) => [j.course_id, j.reversal]));
    assert(byCourse.get(courses.ending) === "skipped_course_ended", "outcome: skipped_course_ended");
    assert(byCourse.get(courses.full) === "restored_over_capacity", "outcome: restored_over_capacity");
    assert(
      cascaded.every((k) => byCourse.get(courses[k]) === "restored"),
      "outcome: restored ×6",
    );

    const overCapNotice = await admin.query(
      `SELECT count(*)::int AS n FROM notifications
        WHERE type='enrollment_restored_over_capacity' AND user_id IN ($1, $2)`,
      [fx.C.adminId, fx.tB],
    );
    assert(
      overCapNotice.rows[0].n === 2,
      `over-capacity is VISIBLE to the center (admin + teacher notified: ${overCapNotice.rows[0].n})`,
    );

    const money1 = await moneyWitness();
    const moved = moneyViolations(money0, money1, fixtureIds);
    assert(
      moved.length === 0,
      `blacklist+restore touched NO money: 0 rows modified/deleted and 0 created for these entities across ${MONEY_TABLES.length} ledger tables + all wallets${moved.length ? " — " + moved.join(", ") : ""}`,
    );

    console.log("\n[2] No duplicate when the student was re-enrolled manually");
    const p2 = await platformBlacklistUser(fx.student, "dup test", fx.superAdmin);
    await admin.query(
      `UPDATE enrollments SET status='active', unenrolled_at=NULL WHERE student_id=$1 AND course_id=$2`,
      [fx.student, courses.a1],
    );
    await admin.query(
      `INSERT INTO enrollments (student_id, course_id, center_id, status, enrolled_by, updated_at)
       VALUES ($1, $2, $3, 'active', $4, now())`,
      [fx.student, courses.b1, fx.B.centerId, fx.superAdmin],
    );
    await removeBlacklistEntry(p2.id, asSuper(fx.superAdmin), "lifted");

    const dup = await admin.query(
      `SELECT course_id, count(*)::int AS n FROM enrollments
        WHERE student_id=$1 AND status='active' GROUP BY course_id HAVING count(*) > 1`,
      [fx.student],
    );
    assert(dup.rowCount === 0, "restore created NO duplicate active enrollment (0 courses with >1)");
    const j2 = new Map((await journal(p2.id)).map((j) => [j.course_id, j.reversal]));
    assert(j2.get(courses.a1) === "skipped_already_active", "outcome: skipped_already_active (row reactivated by hand)");
    assert(j2.get(courses.b1) === "skipped_duplicate", "outcome: skipped_duplicate (new row created by hand)");
    await admin.query(`DELETE FROM enrollments WHERE student_id=$1 AND course_id=$2 AND status='active'
                       AND id NOT IN (SELECT entity_id FROM blacklist_cascade_actions WHERE target_id=$1)`,
      [fx.student, courses.b1]);
    await admin.query(
      `UPDATE enrollments SET status='active', unenrolled_at=NULL WHERE student_id=$1 AND course_id=$2`,
      [fx.student, courses.b1],
    );

    console.log("\n[3] CENTER level — scoped to that center only");
    await admin.query(`UPDATE courses SET status='active' WHERE id=$1`, [courses.ending]);
    const centerAdminA: SessionUser = {
      id: fx.A.adminId,
      role: "center_admin",
      centerId: fx.A.centerId,
    } as SessionUser;

    const cEntry = await centerBlacklistStudent(fx.student, "center test", centerAdminA);
    const afterC = await statuses(fx.student, courses);
    assert(
      afterC.a1 === "unenrolled" && afterC.a2 === "unenrolled",
      "center blacklist unenrolled that center's enrollments",
    );
    assert(
      afterC.b1 === "active" && afterC.b2 === "active" && afterC.c1 === "active" && afterC.direct === "active",
      "center blacklist left OTHER centers and the teacher-direct course untouched",
    );
    await expectThrows(
      () => assertNotBlacklisted(fx.student, fx.A.centerId, fx.tA1),
      "assertNotBlacklisted still blocks at the center level",
    );

    await removeBlacklistEntry(cEntry.id, centerAdminA, "lifted");
    const afterCLift = await statuses(fx.student, courses);
    assert(
      afterCLift.a1 === "active" && afterCLift.a2 === "active",
      "lifting the CENTER blacklist restored only that center's enrollments",
    );
    assert(afterCLift.quit === "unenrolled", "unrelated departure still not restored (center level)");
    const cJ = await journal(cEntry.id);
    assert(
      cJ.length === 2 && cJ.every((j) => j.reversal === "restored"),
      `center journal held ONLY that center's active rows (${cJ.length} = a1 + a2; the quit course at the same center was already gone)`,
    );

    console.log("\n[4] TEACHER level — scoped to that teacher's courses only");
    const teacherA1: SessionUser = { id: fx.tA1, role: "teacher" } as SessionUser;
    const tEntry = await teacherBlacklistStudent(fx.student, "teacher test", teacherA1);
    const afterT = await statuses(fx.student, courses);
    assert(
      afterT.a1 === "unenrolled" && afterT.b2 === "unenrolled",
      "teacher blacklist unenrolled that teacher's courses ACROSS centers (a1 @A, b2 @B)",
    );
    assert(
      afterT.a2 === "active" && afterT.b1 === "active" && afterT.c1 === "active" && afterT.direct === "active",
      "teacher blacklist left OTHER teachers' courses untouched",
    );
    await expectThrows(
      () => assertNotBlacklisted(fx.student, fx.A.centerId, fx.tA1),
      "assertNotBlacklisted still blocks at the teacher level",
    );

    await removeBlacklistEntry(tEntry.id, teacherA1, "lifted");
    const afterTLift = await statuses(fx.student, courses);
    assert(
      afterTLift.a1 === "active" && afterTLift.b2 === "active",
      "lifting the TEACHER blacklist restored only that teacher's courses",
    );
    assert(afterTLift.quit === "unenrolled", "unrelated departure still not restored (teacher level)");

    console.log("\n[5] Overlapping levels — a lift does not override a blacklist that still stands");
    const pEntry3 = await platformBlacklistUser(fx.student, "overlap platform", fx.superAdmin);
    const cEntry2 = await centerBlacklistStudent(fx.student, "overlap center", centerAdminA);
    await removeBlacklistEntry(pEntry3.id, asSuper(fx.superAdmin), "lifted platform only");
    const afterOverlap = await statuses(fx.student, courses);
    assert(
      afterOverlap.a1 === "unenrolled" && afterOverlap.a2 === "unenrolled",
      "center A's enrollments stay OUT — the center blacklist still stands",
    );
    assert(
      afterOverlap.b1 === "active" && afterOverlap.c1 === "active" && afterOverlap.direct === "active",
      "everything outside the standing center ban was restored",
    );
    const oJ = new Map((await journal(pEntry3.id)).map((j) => [j.course_id, j.reversal]));
    assert(
      oJ.get(courses.a1) === "skipped_still_blacklisted" && oJ.get(courses.a2) === "skipped_still_blacklisted",
      "outcome: skipped_still_blacklisted",
    );
    const handed = await journal(cEntry2.id);
    assert(
      handed.length === 2 && handed.every((j) => j.reversed_at === null),
      `the outstanding removals were TRANSFERRED to the standing center ban (${handed.length} open rows)`,
    );
    await removeBlacklistEntry(cEntry2.id, centerAdminA, "lifted center too");
    const afterBoth = await statuses(fx.student, courses);
    assert(
      afterBoth.a1 === "active" && afterBoth.a2 === "active",
      "lifting the LAST blacklist covering them restores center A's enrollments",
    );

    console.log("\n[6] Repeat cycles — blacklist → lift → blacklist → lift stay independent");
    const cyc0 = await statuses(fx.student, courses);
    const e1 = await platformBlacklistUser(fx.student, "cycle 1", fx.superAdmin);
    await removeBlacklistEntry(e1.id, asSuper(fx.superAdmin), "lift 1");
    await admin.query(
      `UPDATE enrollments SET status='unenrolled', unenrolled_at=now() WHERE student_id=$1 AND course_id=$2`,
      [fx.student, courses.c1],
    );
    const e2 = await platformBlacklistUser(fx.student, "cycle 2", fx.superAdmin);
    const e2Journal = await journal(e2.id);
    assert(
      !e2Journal.some((j) => j.course_id === courses.c1),
      "cycle 2 did not journal the course the student quit between cycles",
    );
    await removeBlacklistEntry(e2.id, asSuper(fx.superAdmin), "lift 2");
    const cyc2 = await statuses(fx.student, courses);
    assert(cyc2.c1 === "unenrolled", "the between-cycles departure is NOT restored by cycle 2's lift");
    assert(
      (["a1", "a2", "b1", "b2", "direct"] as const).every((k) => cyc2[k] === cyc0[k]),
      "every other enrollment came back to exactly its pre-cycle state",
    );
    const e1Rows = await journal(e1.id);
    assert(
      e1Rows.every((j) => j.reversed_at !== null) && e2Journal.length > 0,
      "cycle 1's journal rows were stamped and never reconsidered by cycle 2",
    );

    console.log("\n[7] Regressions");
    const st = await admin.query(`SELECT status, token_version FROM users WHERE id=$1`, [fx.student]);
    assert(st.rows[0].status === "active", "C-03: platform lift returns users.status to active");
    assert(st.rows[0].token_version > 0, "C-03: blacklisting bumped the L1 token_version (session revoked)");
    const roster = await admin.query(
      `SELECT blacklisted FROM center_student_rosters WHERE center_id=$1 AND student_id=$2`,
      [fx.A.centerId, fx.student],
    );
    assert(roster.rows[0].blacklisted === false, "center lift cleared the roster blacklist flag");
    let clean = true;
    try {
      await assertNotBlacklisted(fx.student, fx.A.centerId, fx.tA1);
    } catch {
      clean = false;
    }
    assert(clean, "assertNotBlacklisted ALLOWS the student once every blacklist is lifted");

    const moneyEnd = await moneyWitness();
    const movedEnd = moneyViolations(money0, moneyEnd, fixtureIds);
    assert(
      movedEnd.length === 0,
      `end-to-end across every blacklist/lift in this run: 0 money rows modified, deleted, or created for these entities${movedEnd.length ? " — " + movedEnd.join(", ") : ""}`,
    );
  } finally {
    await teardown(fx);
    const leftover = await admin.query(
      `SELECT count(*)::int AS n FROM users WHERE email LIKE $1`,
      [tag + "%"],
    );
    assert(leftover.rows[0].n === 0, "teardown: every fixture row removed");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await admin.end();
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite h04-blacklist-cascade-reversal.test.ts" })
  .then(() => main()).catch(async (e) => {
  console.error(e);
  await admin.end();
  process.exit(1);
});
