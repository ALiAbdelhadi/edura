import { testPool } from "../../../../packages/database/scripts/test-pool";
import { prisma } from "@repo/database";
import { searchCenters } from "@/lib/services/discovery/discovery";

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

const names = (r: { centers: { name: string }[] }) => r.centers.map((c) => c.name);

async function main() {
  const tag = "dir-" + Math.floor(Math.random() * 1e9).toString(36);
  const centerIds: string[] = [];
  const courseIds: string[] = [];
  const userIds: string[] = [];

  const emptyId = crypto.randomUUID();      // active, ZERO courses  <- the bug
  const stockedId = crypto.randomUUID();    // active, one active course
  const suspendedId = crypto.randomUUID();  // SUSPENDED, zero courses
  centerIds.push(emptyId, stockedId, suspendedId);

  try {
    console.log("Center directory search —", tag);

    for (const [id, name, status] of [
      [emptyId, `${tag} Empty`, "active"],
      [stockedId, `${tag} Stocked`, "active"],
      [suspendedId, `${tag} Suspended`, "suspended"],
    ] as const) {
      await admin.query(
        `INSERT INTO centers (id, name, short_id, status, is_demo, created_at, updated_at)
         VALUES ($1, $2, $3, $4::center_status, true, now(), now())`,
        [id, name, id.slice(0, 8).toUpperCase(), status],
      );
    }

    const teacherId = crypto.randomUUID();
    userIds.push(teacherId);
    await admin.query(
      `INSERT INTO users (id, email, role, name, status, is_demo, created_at, updated_at)
       VALUES ($1, $2, 'teacher'::role, 'Dir Proof Teacher', 'active'::user_status, true, now(), now())`,
      [teacherId, `${tag}-teacher@x.io`],
    );

    const courseId = crypto.randomUUID();
    courseIds.push(courseId);
    await admin.query(
      `INSERT INTO courses (id, center_id, teacher_id, title, subject, days_of_week,
                            start_time, end_time, start_date, price, max_students,
                            status, is_demo, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'math', '{1,3}', '16:00', '18:00', now(), 100, 20,
               'active'::course_status, true, now(), now())`,
      [courseId, stockedId, teacherId, `${tag} Course`],
    );

    const student = await searchCenters({ q: tag, limit: "100" });
    assert(
      !names(student).includes(`${tag} Empty`),
      "default (student discovery) still HIDES a center with no active courses",
    );
    assert(
      names(student).includes(`${tag} Stocked`),
      "default still shows a center that has an active course",
    );

    const teacher = await searchCenters({ q: tag, limit: "100", includeEmpty: true });
    assert(
      names(teacher).includes(`${tag} Empty`),
      "includeEmpty SHOWS the course-less center — the apply-to-teach fix",
    );
    assert(
      names(teacher).includes(`${tag} Stocked`),
      "includeEmpty still shows stocked centers too (it widens, never narrows)",
    );

    assert(
      !names(student).includes(`${tag} Suspended`) &&
        !names(teacher).includes(`${tag} Suspended`),
      "a SUSPENDED center is hidden in BOTH modes — includeEmpty touches courses only",
    );

    const typed = await searchCenters({ q: `${tag} Empt`, limit: "100", includeEmpty: true });
    assert(
      names(typed).includes(`${tag} Empty`) && !names(typed).includes(`${tag} Stocked`),
      "q still filters in includeEmpty mode (the picker's one search box works)",
    );
    assert(
      (await searchCenters({ q: `${tag}-nomatch`, limit: "100", includeEmpty: true })).centers
        .length === 0,
      "a non-matching query returns nothing rather than the whole directory",
    );
  } finally {
    await admin.query(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [courseIds]);
    await admin.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [centerIds]);
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
    await admin.end();
    await prisma.$disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite center-directory-search.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
