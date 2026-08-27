import { testPool } from "../../../../packages/database/scripts/test-pool";
import { prisma } from "@repo/database";
import { globalSearch } from "@repo/server-core/services/search/global-search";
import { authorizeCenterActor } from "@/lib/authz/center-actor";
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

const ALL_STAFF = ["receptionist", "manager", "center_accountant"] as const;

type Hit = { kind: string; title: string; href: string; masked?: boolean; badge?: string };

async function main() {
  const tag = "gs-" + Math.floor(Math.random() * 1e9).toString(36);
  const userIds: string[] = [];
  const centerIds: string[] = [];
  const courseIds: string[] = [];

  const centerA = crypto.randomUUID();
  const centerB = crypto.randomUUID();
  centerIds.push(centerA, centerB);

  const ownerA = crypto.randomUUID();
  const ownerB = crypto.randomUUID();
  const receptionist = crypto.randomUUID();
  const manager = crypto.randomUUID();
  const accountant = crypto.randomUUID();
  const teacher = crypto.randomUUID();
  const otherTeacher = crypto.randomUUID();
  const assistant = crypto.randomUUID();
  const parent = crypto.randomUUID();
  const studentA = crypto.randomUUID(); // centre A's roster, teacher's group
  const studentB = crypto.randomUUID(); // centre B's roster only
  const studentC = crypto.randomUUID(); // A's roster, the OTHER teacher's group
  const studentAr = crypto.randomUUID();
  userIds.push(
    ownerA, ownerB, receptionist, manager, accountant, teacher, otherTeacher,
    assistant, parent, studentA, studentB, studentC, studentAr,
  );

  const courseA = crypto.randomUUID(); // centre A, `teacher`
  const courseB = crypto.randomUUID(); // centre B
  const courseC = crypto.randomUUID(); // centre A, `otherTeacher`
  courseIds.push(courseA, courseB, courseC);

  const roomA = crypto.randomUUID();
  const roomB = crypto.randomUUID();

  const WORD = `${tag}zebra`;

  const AR_NAME = `فاطمة إبراهيم ${tag}`;
  const AR_PHONE = "01099887766";
  const AR_ROOM = `قاعة الأنشطة ${tag}`;

  const census = async () => {
    const r = await admin.query(
      `SELECT
         (SELECT count(*) FROM users)        AS users,
         (SELECT count(*) FROM courses)      AS courses,
         (SELECT count(*) FROM payments)     AS payments,
         (SELECT count(*) FROM transactions) AS transactions,
         (SELECT count(*) FROM audit_logs)   AS audit_logs`,
    );
    return JSON.stringify(r.rows[0]);
  };

  const session = (id: string, role: string, centerId?: string): SessionUser =>
    ({ id, role, centerId, locale: "ar" } as SessionUser);

  const centerSearch = async (user: SessionUser, q: string) => {
    const actor = await authorizeCenterActor(user, { allow: ALL_STAFF });
    return globalSearch(
      {
        kind: "center",
        acting: actor.acting,
        staffRole: actor.staffRole,
        portal: user.role === "center_admin" ? "admin" : "staff",
      },
      { q, locale: "ar" },
    );
  };

  const kinds = (r: { groups: { kind: string }[] }) => r.groups.map((g) => g.kind).sort();
  const hits = (r: { groups: { kind: string; hits: Hit[] }[] }, kind: string): Hit[] =>
    r.groups.find((g) => g.kind === kind)?.hits ?? [];
  const titles = (r: { groups: { kind: string; hits: Hit[] }[] }, kind: string) =>
    hits(r, kind).map((h) => h.title);
  const allHits = (r: { groups: { hits: Hit[] }[] }) => r.groups.flatMap((g) => g.hits);

  try {
    console.log("Global search —", tag);

    for (const [id, name] of [
      [centerA, `${WORD} Center A`],
      [centerB, `${WORD} Center B`],
    ] as const) {
      await admin.query(
        `INSERT INTO centers (id, name, short_id, status, is_demo, created_at, updated_at)
         VALUES ($1, $2, $3, 'active'::center_status, true, now(), now())`,
        [id, name, id.slice(0, 8).toUpperCase()],
      );
    }

    const mkUser = async (id: string, role: string, name: string) => {
      await admin.query(
        `INSERT INTO users (id, email, role, name, status, is_demo, created_at, updated_at)
         VALUES ($1, $2, $3::role, $4, 'active'::user_status, true, now(), now())`,
        [id, `${id}@${tag}.test`, role, name],
      );
    };
    await mkUser(ownerA, "center_admin", `${WORD} Owner A`);
    await mkUser(ownerB, "center_admin", `${WORD} Owner B`);
    await mkUser(receptionist, "center_staff", `${WORD} Reception`);
    await mkUser(manager, "center_staff", `${WORD} Manager`);
    await mkUser(accountant, "center_staff", `${WORD} Accountant`);
    await mkUser(teacher, "teacher", `${WORD} Teacher`);
    await mkUser(otherTeacher, "teacher", `${WORD} Other Teacher`);
    await mkUser(assistant, "assistant", `${WORD} Assistant`);
    await mkUser(parent, "parent", `${WORD} Parent`);
    await mkUser(studentA, "student", `${WORD} Student A`);
    await mkUser(studentB, "student", `${WORD} Student B`);
    await mkUser(studentC, "student", `${WORD} Student C`);
    await mkUser(studentAr, "student", AR_NAME);
    await admin.query(`UPDATE users SET phone = $2 WHERE id = $1`, [studentAr, AR_PHONE]);

    await admin.query(
      `UPDATE centers SET owner_user_id = $2 WHERE id = $1`, [centerA, ownerA]);
    await admin.query(
      `UPDATE centers SET owner_user_id = $2 WHERE id = $1`, [centerB, ownerB]);

    for (const [id, role] of [
      [receptionist, "receptionist"],
      [manager, "manager"],
      [accountant, "center_accountant"],
    ] as const) {
      await admin.query(
        `INSERT INTO center_staff (id, center_id, staff_user_id, role, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3::center_staff_role, now(), now())`,
        [centerA, id, role],
      );
    }

    for (const id of [studentA, studentB, studentC, studentAr]) {
      await admin.query(
        `INSERT INTO student_profiles (id, user_id, full_name, family_link_code, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, now(), now())`,
        [id, `${WORD} Profile ${id.slice(0, 4)}`, id.slice(0, 8).toUpperCase()],
      );
    }
    const codeOf = async (id: string): Promise<string> =>
      (await admin.query(`SELECT student_code FROM student_profiles WHERE user_id = $1`, [id]))
        .rows[0].student_code;
    const codeB = await codeOf(studentB);

    for (const [centerId, studentId] of [
      [centerA, studentA],
      [centerA, studentC],
      [centerA, studentAr],
      [centerB, studentB],
    ] as const) {
      await admin.query(
        `INSERT INTO center_student_rosters (id, center_id, student_id, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, now(), now())`,
        [centerId, studentId],
      );
    }

    await admin.query(
      `INSERT INTO center_teacher_affiliations
         (id, center_id, teacher_id, status, invited_at, expires_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'active'::affiliation_status, now(), now() + interval '1 year', now(), now())`,
      [centerA, teacher],
    );
    await admin.query(
      `INSERT INTO teacher_assistants (id, teacher_id, assistant_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, now(), now())`,
      [teacher, assistant],
    );

    for (const [id, centerId, teacherId, title] of [
      [courseA, centerA, teacher, `${WORD} Group A`],
      [courseB, centerB, otherTeacher, `${WORD} Group B`],
      [courseC, centerA, otherTeacher, `${WORD} Group C`],
    ] as const) {
      await admin.query(
        `INSERT INTO courses (id, center_id, teacher_id, title, subject, days_of_week,
                              start_time, end_time, start_date, price, max_students,
                              status, is_demo, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'math', '{1,3}', '16:00', '18:00', now(), 10000, 20,
                 'active'::course_status, true, now(), now())`,
        [id, centerId, teacherId, title],
      );
    }

    for (const [studentId, courseId, centerId] of [
      [studentA, courseA, centerA],
      [studentC, courseC, centerA],
      [studentB, courseB, centerB],
    ] as const) {
      await admin.query(
        `INSERT INTO enrollments (id, student_id, course_id, center_id, status, enrolled_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'active'::enrollment_status, $1, now(), now())`,
        [studentId, courseId, centerId],
      );
    }

    for (const [id, centerId, name] of [
      [roomA, centerA, `${WORD} Hall A`],
      [roomB, centerB, `${WORD} Hall B`],
      [crypto.randomUUID(), centerA, AR_ROOM],
    ] as const) {
      await admin.query(
        `INSERT INTO rooms (id, center_id, name, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, true, now(), now())`,
        [id, centerId, name],
      );
    }

    const receiptA = `RCP-${tag.toUpperCase()}-A`;
    const receiptB = `RCP-${tag.toUpperCase()}-B`;
    for (const [centerId, studentId, receipt] of [
      [centerA, studentA, receiptA],
      [centerB, studentB, receiptB],
    ] as const) {
      await admin.query(
        `INSERT INTO payments (id, center_id, student_id, status, amount,
                               receipt_number, recorded_by, paid_at, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'paid'::payment_status, 5000,
                 $3, $4, now(), now(), now())`,
        [centerId, studentId, receipt, ownerA],
      );
    }

    await admin.query(
      `INSERT INTO parent_student_links (id, parent_id, student_id, status, initiated_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'approved'::parent_link_status, 'parent'::link_actor, now(), now()),
              (gen_random_uuid(), $1, $3, 'pending'::parent_link_status,  'parent'::link_actor, now(), now())`,
      [parent, studentA, studentC],
    );

    const before = await census();

    const a = await centerSearch(session(ownerA, "center_admin", centerA), WORD);

    assert(
      titles(a, "student").some((t) => t.includes("Student A")),
      "owner finds their own roster student by name",
    );
    assert(
      !titles(a, "student").some((t) => t.includes("Student B")),
      "TENANCY: the other centre's student is absent from a NAME search",
    );
    assert(
      titles(a, "course").includes(`${WORD} Group A`) &&
        titles(a, "course").includes(`${WORD} Group C`),
      "owner finds both of their own groups",
    );
    assert(
      !titles(a, "course").includes(`${WORD} Group B`),
      "TENANCY: the other centre's group is absent",
    );
    assert(
      titles(a, "room").includes(`${WORD} Hall A`) &&
        !titles(a, "room").includes(`${WORD} Hall B`),
      "TENANCY: halls are the asking centre's only",
    );
    assert(
      titles(a, "staff").length === 3 &&
        titles(a, "staff").every((t) => t.includes(WORD)),
      "owner finds their three staff members",
    );
    assert(
      titles(a, "teacher").includes(`${WORD} Teacher`) &&
        !titles(a, "teacher").includes(`${WORD} Other Teacher`),
      "TENANCY: only the AFFILIATED teacher is found, not every teacher on the platform",
    );

    const receipts = await centerSearch(session(ownerA, "center_admin", centerA), receiptA);
    assert(
      hits(receipts, "payment").some((h) => h.badge === receiptA),
      "a receipt number resolves its payment",
    );
    const foreignReceipt = await centerSearch(
      session(ownerA, "center_admin", centerA),
      receiptB,
    );
    assert(
      hits(foreignReceipt, "payment").every((h) => h.badge !== receiptB),
      "TENANCY: the other centre's receipt number resolves to NOTHING of theirs",
    );

    const r = await centerSearch(session(receptionist, "center_staff"), WORD);
    assert(
      kinds(r).join(",") === "student",
      `receptionist reaches STUDENTS ONLY (got: ${kinds(r).join(",") || "nothing"})`,
    );

    const m = await centerSearch(session(manager, "center_staff"), WORD);
    assert(
      kinds(m).join(",") === "room,student",
      `manager reaches students + halls, and no further (got: ${kinds(m).join(",")})`,
    );
    assert(
      !kinds(m).includes("payment"),
      "a manager may NOT reach receipts — the accountant/manager split holds here too",
    );

    const acc = await centerSearch(session(accountant, "center_staff"), receiptA);
    assert(
      kinds(acc).join(",") === "payment",
      `center_accountant reaches RECEIPTS ONLY (got: ${kinds(acc).join(",") || "nothing"})`,
    );
    const accByName = await centerSearch(session(accountant, "center_staff"), WORD);
    assert(
      accByName.groups.length === 0,
      "center_accountant is a SIDEWAYS tier: a student name finds them nothing",
    );

    const byName = await centerSearch(
      session(ownerA, "center_admin", centerA),
      `${WORD} Student B`,
    );
    assert(
      !titles(byName, "student").some((t) => t.includes("Student B")),
      "a NAME cannot reach a child this centre does not hold",
    );
    const byCode = await centerSearch(session(ownerA, "center_admin", centerA), codeB);
    const foreign = hits(byCode, "student")[0];
    assert(!!foreign, "that same child's CODE does resolve — the identifier reach");
    assert(foreign?.masked === true, "…and comes back MASKED");
    assert(
      Boolean(foreign?.href.includes("/checkin?code=")),
      "…pointed at the counter, not at a record page this centre may not open",
    );

    const tRes = await globalSearch(
      { kind: "teacher", acting: session(teacher, "teacher"), portal: "teacher" },
      { q: WORD, locale: "ar" },
    );
    assert(
      titles(tRes, "course").join(",") === `${WORD} Group A`,
      "a teacher finds their OWN group and no other",
    );
    assert(
      titles(tRes, "student").some((t) => t.includes("Student A")) &&
        !titles(tRes, "student").some((t) => t.includes("Student C")),
      "a teacher finds only the students enrolled in their own groups",
    );
    assert(
      titles(tRes, "center").includes(`${WORD} Center A`),
      "a teacher finds the centre they are affiliated with",
    );

    const aRes = await globalSearch(
      { kind: "teacher", acting: { ...session(teacher, "teacher") }, portal: "assistant" },
      { q: WORD, locale: "ar" },
    );
    assert(
      JSON.stringify(titles(aRes, "student")) === JSON.stringify(titles(tRes, "student")),
      "an assistant sees EXACTLY the teacher's students — no wider, no narrower",
    );
    assert(
      !kinds(aRes).includes("center"),
      "…but no centres: the assistant portal has no screen for them (constitution §3)",
    );
    assert(
      allHits(aRes).every((h) => h.href.startsWith("/dashboard/assistant/")),
      "every assistant hit lands inside the assistant portal",
    );

    const pRes = await globalSearch(
      { kind: "parent", user: session(parent, "parent") },
      { q: WORD, locale: "ar" },
    );
    assert(
      titles(pRes, "child").some((t) => t.includes("Student A")),
      "a parent finds the child they hold an APPROVED link to",
    );
    assert(
      !titles(pRes, "child").some((t) => t.includes("Student C")),
      "a PENDING link resolves to nothing — approval is the gate, here as everywhere",
    );

    const sRes = await globalSearch(
      { kind: "student", user: session(studentA, "student") },
      { q: WORD, locale: "ar" },
    );
    assert(
      titles(sRes, "course").join(",") === `${WORD} Group A`,
      "a student finds the group they are enrolled in, and only that",
    );

    const short = await centerSearch(session(ownerA, "center_admin", centerA), "z");
    assert(
      short.groups.length === 0,
      "a one-character query returns nothing at all (no provider runs)",
    );
    const blank = await centerSearch(session(ownerA, "center_admin", centerA), "   ");
    assert(blank.groups.length === 0, "whitespace is not a query either");

    assert(
      allHits(a).every((h) => h.href.startsWith("/dashboard/admin/")),
      "every owner hit lands inside the center-admin portal",
    );
    assert(
      allHits(m).every((h) => h.href.startsWith("/dashboard/staff/")),
      "every staff hit lands inside the staff portal",
    );
    assert(
      allHits(pRes).every((h) => h.href.startsWith("/dashboard/parent/")),
      "every parent hit lands inside the parent portal",
    );

    const rawIlike = await admin.query(
      `SELECT count(*)::int AS n FROM users WHERE id = $1 AND name ILIKE '%' || $2 || '%'`,
      [studentAr, `فاطمه ${tag}`],
    );
    assert(
      rawIlike.rows[0].n === 0,
      "CONTROL: raw ILIKE still finds nothing for «فاطمه» against a row stored «فاطمة»",
    );

    const arTitles = async (q: string) =>
      titles(await centerSearch(session(ownerA, "center_admin", centerA), q), "student");

    assert(
      (await arTitles(`فاطمه ${tag}`)).includes(AR_NAME),
      "ta marbuta: «فاطمه» finds «فاطمة» — the same child, the way it is typed",
    );
    assert(
      (await arTitles(`ابراهيم ${tag}`)).includes(AR_NAME),
      "hamza: «ابراهيم» finds «إبراهيم» — the hamza needs Shift, so nobody types it",
    );
    assert(
      (await arTitles(`${tag} ابراهيم فاطمه`)).includes(AR_NAME),
      "word order: the family name typed first still finds the row",
    );
    assert(
      (await arTitles(`فاطمة إبراهيم ${tag}`)).includes(AR_NAME),
      "…and the name typed EXACTLY as stored still works — nothing regressed",
    );
    assert(
      (await arTitles("٠١٠٩٩٨٨٧٧٦٦")).includes(AR_NAME),
      "an Arabic-Indic phone number resolves — the numerals fold onto ASCII",
    );
    assert(
      !(await arTitles(`سعاد ${tag}`)).includes(AR_NAME),
      "…and it is NOT fuzzy: a different name still finds nothing",
    );

    const arRooms = titles(
      await centerSearch(session(ownerA, "center_admin", centerA), `قاعه الانشطه ${tag}`),
      "room",
    );
    assert(
      arRooms.includes(AR_ROOM),
      "the same rules reach every provider: «قاعه الانشطه» finds «قاعة الأنشطة»",
    );

    assert(
      (await census()) === before,
      "a search moves no money, creates no row, and writes no audit entry",
    );
  } finally {
    await admin.query(`DELETE FROM parent_student_links WHERE parent_id = $1`, [parent]);
    await admin.query(`DELETE FROM payments WHERE center_id = ANY($1::uuid[])`, [centerIds]);
    await admin.query(`DELETE FROM enrollments WHERE course_id = ANY($1::uuid[])`, [courseIds]);
    await admin.query(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [courseIds]);
    await admin.query(`DELETE FROM rooms WHERE center_id = ANY($1::uuid[])`, [centerIds]);
    await admin.query(`DELETE FROM teacher_assistants WHERE teacher_id = $1`, [teacher]);
    await admin.query(
      `DELETE FROM center_teacher_affiliations WHERE center_id = ANY($1::uuid[])`, [centerIds]);
    await admin.query(
      `DELETE FROM center_student_rosters WHERE center_id = ANY($1::uuid[])`, [centerIds]);
    await admin.query(`DELETE FROM center_staff WHERE center_id = ANY($1::uuid[])`, [centerIds]);
    await admin.query(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [userIds]);
    await admin.query(`UPDATE centers SET owner_user_id = NULL WHERE id = ANY($1::uuid[])`, [centerIds]);
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
    await admin.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [centerIds]);
    await admin.end();
    await prisma.$disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite global-search.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
