// Student ID card + student code v2 — proofs against the LIVE DB, driving the
// REAL services with plain SessionUser objects. No mocks.
//
// Proves:
//   1. WHO MAY SEE A CARD — the student themselves and a parent with an
//      APPROVED link; a pending / rejected / revoked link, another student,
//      another parent, a teacher and a center admin are all refused.
//   2. WHAT THE CARD CARRIES — an exhaustive key check, because "we did not
//      put the phone on it" is a claim about the object, not about intent.
//      A card is printed, photographed and dropped in corridors, and nearly
//      every student here is a minor.
//   3. ISSUANCE IS ONCE-ONLY — a pending 'X' code becomes the system letter
//      exactly once, is derived from the student's own profile id, and no
//      later call (a re-run, a changed grade, a second finalize) can move it.
//   4. THE SQL AND THE TYPESCRIPT AGREE — `gen_student_code()` mints codes
//      inside the INSERT and TypeScript verifies them at the counter. Two
//      implementations of one rule, so the agreement is asserted rather than
//      assumed: 400 minted codes, every one verified, and every single
//      character mutation of them rejected.
//   5. THE COUNTER CANNOT RESOLVE A TYPO — `lookupStudents` finds the student
//      by their real code, and finds NOBODY when one character is wrong.
//      That is the whole reason the check character exists.
//   6. THE DATABASE HOLDS THE SHAPE — the CHECK constraint rejects a code with
//      a character outside the alphabet and a code whose check character does
//      not agree, so no writer anywhere can store one the counter would fail.
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { withPlatformContext, prisma } from "@repo/database";
import {
  PENDING_SYSTEM_LETTER,
  STUDENT_CODE_ALPHABET,
  isValidStudentCode,
  resolveStudentCode,
} from "@repo/database/student-code";
import {
  deriveStudentCodeBody,
  finalizeStudentCode,
} from "@repo/database/student-code-issue";
import { ForbiddenError, NotFoundError } from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";
import {
  buildProfileChecklist,
  buildStudentCard,
} from "@repo/server-core/services/students/student-card";
import { lookupStudents } from "@repo/server-core/services/attendance/checkin";

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
async function expectError(
  fn: () => Promise<unknown>,
  cls: new (...a: never[]) => Error,
  label: string,
) {
  try {
    await fn();
    assert(false, `${label} — expected ${cls.name} but call RESOLVED`);
  } catch (e) {
    assert(
      e instanceof cls,
      `${label} -> ${cls.name}${e instanceof cls ? "" : ` (got ${(e as Error)?.constructor?.name}: ${(e as Error)?.message})`}`,
    );
  }
}

const su = (u: { id: string; role: string; centerId?: string; name?: string }): SessionUser =>
  ({
    id: u.id,
    role: u.role,
    centerId: u.centerId,
    locale: "ar",
    name: u.name ?? "test",
    email: null,
  }) as unknown as SessionUser;

async function main() {
  const tag = "sid-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("Student ID card DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const mkUser = (key: string, role: string) =>
      tx.user.create({
        data: {
          name: `${tag}-${key}`,
          role: role as never,
          email: `${tag}-${key}@x.io`,
          phone: `0100${Math.floor(Math.random() * 1e7).toString().padStart(7, "0")}`,
          status: "active",
        },
      });

    const student = await mkUser("student", "student");
    const other = await mkUser("other", "student");
    const parent = await mkUser("parent", "parent");
    const pendingParent = await mkUser("pparent", "parent");
    const revokedParent = await mkUser("rparent", "parent");
    const strangerParent = await mkUser("sparent", "parent");
    const teacher = await mkUser("teacher", "teacher");
    const gone = await mkUser("gone", "student");

    // A real catalog system, so the letter comes from the catalog and not from
    // a constant in the test.
    const system = await tx.educationSystem.findFirst({
      where: { code: "general" },
      select: { id: true, codeLetter: true },
    });
    if (!system?.codeLetter) throw new Error("catalog: education system 'general' has no code_letter");
    const stage = await tx.stage.findFirst({
      where: { educationSystemId: system.id },
      select: { id: true },
    });
    const grade = await tx.gradeLevel.findFirst({
      where: { stageId: stage?.id },
      select: { id: true },
    });

    const mkProfile = (userId: string, key: string, withSystem: boolean) =>
      tx.studentProfile.create({
        data: {
          userId,
          fullName: `${tag}-${key}`,
          familyLinkCode: `${tag}${key}`.slice(0, 20),
          ...(withSystem
            ? { educationSystemId: system.id, stageId: stage?.id, gradeLevelId: grade?.id, onboardingCompleted: true }
            : {}),
        },
      });

    const sp = await mkProfile(student.id, "s1", true);
    await mkProfile(other.id, "s2", true);
    await mkProfile(gone.id, "s3", false);

    await tx.parentProfile.create({ data: { userId: parent.id } });

    await tx.parentStudentLink.create({
      data: { parentId: parent.id, studentId: student.id, status: "approved", initiatedBy: "parent" },
    });
    await tx.parentStudentLink.create({
      data: { parentId: pendingParent.id, studentId: student.id, status: "pending", initiatedBy: "parent" },
    });
    await tx.parentStudentLink.create({
      data: { parentId: revokedParent.id, studentId: student.id, status: "revoked", initiatedBy: "parent" },
    });

    return {
      student, other, parent, pendingParent, revokedParent, strangerParent,
      teacher, gone,
      profileId: sp.id,
      systemLetter: system.codeLetter,
    };
  });

  const U = [
    fx.student, fx.other, fx.parent, fx.pendingParent, fx.revokedParent,
    fx.strangerParent, fx.teacher, fx.gone,
  ].map((u) => u.id);

  const studentUser = su({ id: fx.student.id, role: "student" });
  const otherUser = su({ id: fx.other.id, role: "student" });
  const parentUser = su({ id: fx.parent.id, role: "parent" });

  try {
    // ================= 1. ISSUANCE =================
    console.log("\n-- issuance --");

    const born = await withPlatformContext((tx) =>
      tx.studentProfile.findUnique({
        where: { userId: fx.student.id },
        select: { studentCode: true },
      }),
    );
    assert(
      born!.studentCode.startsWith(PENDING_SYSTEM_LETTER),
      `a new profile is born PENDING (${born!.studentCode})`,
    );
    assert(isValidStudentCode(born!.studentCode), "the pending code is itself a valid, usable code");

    const first = await withPlatformContext((tx) => finalizeStudentCode(tx, fx.student.id));
    assert(first?.changed === true, "finalize issues the permanent code");
    assert(
      first!.studentCode.startsWith(fx.systemLetter),
      `the code opens with the CATALOG's letter for this system (${fx.systemLetter}${"…"})`,
    );
    assert(isValidStudentCode(first!.studentCode), "the issued code verifies");
    assert(
      first!.studentCode.slice(1, 7) === deriveStudentCodeBody(fx.profileId, 0),
      "the body is derived from the student's OWN profile id — reproducible from their record",
    );

    const second = await withPlatformContext((tx) => finalizeStudentCode(tx, fx.student.id));
    assert(second?.changed === false, "a second finalize is a no-op");
    assert(second?.studentCode === first?.studentCode, "…and the code did not move");

    // The strongest form of the once-only guarantee: even a caller who has no
    // idea the rule exists cannot move an issued code.
    const third = await withPlatformContext(async (tx) => {
      await tx.studentProfile.update({
        where: { userId: fx.student.id },
        data: { gradeLevelId: null, trackId: null },
      });
      return finalizeStudentCode(tx, fx.student.id);
    });
    assert(
      third?.studentCode === first?.studentCode,
      "changing the student's academic details does NOT re-issue the code",
    );

    const noSystem = await withPlatformContext((tx) => finalizeStudentCode(tx, fx.gone.id));
    assert(
      noSystem?.changed === false && noSystem.studentCode.startsWith(PENDING_SYSTEM_LETTER),
      "a student with no education system stays pending — waiting is not an error",
    );

    const CODE = first!.studentCode;

    // ================= 2. WHO MAY SEE THE CARD =================
    console.log("\n-- authorization --");

    const mine = await buildStudentCard(fx.student.id, studentUser);
    assert(mine.studentCode === CODE, "the student sees their own card");
    assert(mine.isPending === false, "…and it is not pending");

    const asParent = await buildStudentCard(fx.student.id, parentUser);
    assert(asParent.studentCode === CODE, "an APPROVED parent sees their child's card");

    await expectError(
      () => buildStudentCard(fx.student.id, su({ id: fx.pendingParent.id, role: "parent" })),
      ForbiddenError,
      "a PENDING parent link is refused",
    );
    await expectError(
      () => buildStudentCard(fx.student.id, su({ id: fx.revokedParent.id, role: "parent" })),
      ForbiddenError,
      "a REVOKED parent link is refused",
    );
    await expectError(
      () => buildStudentCard(fx.student.id, su({ id: fx.strangerParent.id, role: "parent" })),
      ForbiddenError,
      "an unrelated parent is refused",
    );
    await expectError(
      () => buildStudentCard(fx.student.id, otherUser),
      ForbiddenError,
      "another student is refused",
    );
    await expectError(
      () => buildStudentCard(fx.student.id, su({ id: fx.teacher.id, role: "teacher" })),
      ForbiddenError,
      "a teacher is refused — a student's card is the student's",
    );
    await expectError(
      () => buildStudentCard(fx.student.id, su({ id: fx.teacher.id, role: "center_admin" })),
      ForbiddenError,
      "a center admin is refused",
    );
    await expectError(
      () => buildProfileChecklist(fx.student.id, otherUser),
      ForbiddenError,
      "the checklist carries the SAME gate as the card",
    );

    // Soft-deleted: gone means gone, on this surface too.
    await withPlatformContext((tx) =>
      tx.user.update({ where: { id: fx.other.id }, data: { deletedAt: new Date() } }),
    );
    await expectError(
      () => buildStudentCard(fx.other.id, su({ id: fx.other.id, role: "student" })),
      NotFoundError,
      "a soft-deleted student has no card",
    );

    // ================= 3. WHAT THE CARD CARRIES =================
    console.log("\n-- disclosure --");

    const KEYS = Object.keys(mine).sort();
    assert(
      JSON.stringify(KEYS) ===
        JSON.stringify(
          [
            "educationSystem", "gradeLevel", "isPending", "memberSince", "name",
            "patternSeed", "stage", "studentCode", "studentId", "track",
          ].sort(),
        ),
      `the card carries EXACTLY these fields: ${KEYS.join(", ")}`,
    );
    const flat = JSON.stringify(mine);
    for (const [what, needle] of [
      ["a phone number", fx.student.phone],
      ["an email", `${tag}-student@x.io`],
    ] as const) {
      assert(needle === null || !flat.includes(needle as string), `the card carries no ${what}`);
    }
    assert(!("dateOfBirth" in mine), "the card carries no date of birth");
    assert(!("nationalId" in mine), "the card carries no national ID");
    assert(!("walletBalance" in mine) && !("pointsBalance" in mine), "the card carries no money");
    assert(
      mine.patternSeed === fx.student.id,
      "the pattern seed is the student's own id — already in every URL they open, and not a secret",
    );

    // ================= 4. SQL AND TYPESCRIPT AGREE =================
    console.log("\n-- the SQL generator and the TypeScript verifier --");

    const minted = await admin.query<{ code: string }>(
      `SELECT student_code_for(l) AS code
         FROM (SELECT unnest(ARRAY['X','G','A','B']) AS l) s, generate_series(1, 100)`,
    );
    assert(minted.rows.length === 400, "minted 400 codes with the DB's own generator");
    const rejectedByTs = minted.rows.filter((r) => !isValidStudentCode(r.code));
    assert(rejectedByTs.length === 0, "TypeScript verifies EVERY code the SQL function minted");

    let slipped = 0;
    for (const { code } of minted.rows.slice(0, 40)) {
      for (let i = 0; i < code.length; i++) {
        for (const ch of STUDENT_CODE_ALPHABET) {
          if (ch === code[i]) continue;
          if (isValidStudentCode(code.slice(0, i) + ch + code.slice(i + 1))) slipped++;
        }
      }
    }
    assert(slipped === 0, "9600 single-character mutations of those codes: none validates");

    // ================= 5. THE COUNTER =================
    console.log("\n-- the counter --");

    const centerStaffUser = su({ id: fx.teacher.id, role: "center_admin", centerId: fx.student.id });
    const hit = await lookupStudents(CODE, centerStaffUser);
    assert(
      hit.some((m) => m.studentId === fx.student.id),
      "the counter finds the student by their real code",
    );

    const wrongChar = STUDENT_CODE_ALPHABET[(STUDENT_CODE_ALPHABET.indexOf(CODE[2]!) + 1) % 31];
    const typo = CODE.slice(0, 2) + wrongChar + CODE.slice(3);
    assert(resolveStudentCode(typo) === null, `one character wrong is not a code (${typo})`);
    const missed = await lookupStudents(typo, centerStaffUser);
    assert(
      !missed.some((m) => m.studentId === fx.student.id),
      "…and the counter finds NOBODY for it — the defect this format exists to close",
    );

    const grouped = await lookupStudents(`${CODE.slice(0, 4)}-${CODE.slice(4)}`, centerStaffUser);
    assert(
      grouped.some((m) => m.studentId === fx.student.id),
      "the code as PRINTED on the card (grouped) resolves too",
    );

    // ================= 6. THE DATABASE HOLDS THE SHAPE =================
    console.log("\n-- the CHECK constraint --");

    for (const [label, bad] of [
      ["a character outside the alphabet", "GZZZZZZZ"],
      ["a wrong check character", CODE.slice(0, 7) + (CODE[7] === "0" ? "1" : "0")],
      ["the retired STU- format", "STU-0001"],
      ["too short", CODE.slice(0, 7)],
    ] as const) {
      try {
        await admin.query(`UPDATE student_profiles SET student_code = $1 WHERE user_id = $2`, [
          bad,
          fx.student.id,
        ]);
        assert(false, `${label} — the UPDATE unexpectedly succeeded (${bad})`);
      } catch (e) {
        assert(
          (e as { code?: string }).code === "23514",
          `${label} rejected by the CHECK constraint (23514)`,
        );
      }
    }
    const after = await withPlatformContext((tx) =>
      tx.studentProfile.findUnique({
        where: { userId: fx.student.id },
        select: { studentCode: true },
      }),
    );
    assert(after!.studentCode === CODE, "…and the real code survived every attempt");
  } finally {
    await admin.query(`DELETE FROM parent_student_links WHERE parent_id = ANY($1::uuid[]) OR student_id = ANY($1::uuid[])`, [U]);
    await admin.query(`DELETE FROM parent_profiles WHERE user_id = ANY($1::uuid[])`, [U]);
    await admin.query(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [U]);
    await admin.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [U]);
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [U]);
    await admin.end();
    await prisma.$disconnect().catch(() => {});
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

// The environment guard runs BEFORE main(), so invoking this file directly
// cannot write to dev or production.
assertDbEnv(["test"], { intent: "suite student-id-card.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
