import { testPool } from "../../../../packages/database/scripts/test-pool";
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
            ? {
                educationSystemId: system.id,
                stageId: stage?.id,
                gradeLevelId: grade?.id,
                onboardingCompleted: true,
                guardianEmail: `${tag}-${key}-guardian@x.io`,
              }
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

    const center = await tx.center.create({
      data: { name: `${tag}-center`, shortId: `${tag}`.slice(0, 20), receiptSeq: 0 },
    });
    await tx.centerStudentRoster.create({
      data: { centerId: center.id, studentId: other.id },
    });

    const rivalCenter = await tx.center.create({
      data: { name: `${tag}-rival`, shortId: `${tag}r`.slice(0, 20), receiptSeq: 0 },
    });
    await tx.centerStudentRoster.create({
      data: { centerId: rivalCenter.id, studentId: student.id },
    });

    return {
      student, other, parent, pendingParent, revokedParent, strangerParent,
      teacher, gone, center, rivalCenter,
      profileId: sp.id,
      systemLetter: system.codeLetter,
      gradeLevelId: grade?.id ?? null,
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

    await withPlatformContext((tx) =>
      tx.studentProfile.update({
        where: { userId: fx.student.id },
        data: { gradeLevelId: fx.gradeLevelId },
      }),
    );

    const noSystem = await withPlatformContext((tx) => finalizeStudentCode(tx, fx.gone.id));
    assert(
      noSystem?.changed === false && noSystem.studentCode.startsWith(PENDING_SYSTEM_LETTER),
      "a student with no education system stays pending — waiting is not an error",
    );

    const CODE = first!.studentCode;

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

    await withPlatformContext((tx) =>
      tx.user.update({ where: { id: fx.other.id }, data: { deletedAt: new Date() } }),
    );
    await expectError(
      () => buildStudentCard(fx.other.id, su({ id: fx.other.id, role: "student" })),
      NotFoundError,
      "a soft-deleted student has no card",
    );

    console.log("\n-- disclosure --");

    const KEYS = Object.keys(mine).sort();
    assert(
      JSON.stringify(KEYS) ===
        JSON.stringify(
          [
            "educationSystem", "gradeLevel", "isPending", "memberSince", "name",
            "patternSeed", "qr", "stage", "studentCode", "studentId", "track",
          ].sort(),
        ),
      `the card carries EXACTLY these fields: ${KEYS.join(", ")}`,
    );
    const QR_KEYS = Object.keys(mine.qr).sort();
    assert(
      JSON.stringify(QR_KEYS) ===
        JSON.stringify(["issuedAt", "revokedAt", "revokedReason", "url", "version"]),
      `the QR block carries EXACTLY these fields: ${QR_KEYS.join(", ")}`,
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

    console.log("\n-- the counter --");

    const centerStaffUser = su({ id: fx.teacher.id, role: "center_admin", centerId: fx.student.id });
    const hit = await lookupStudents(CODE, centerStaffUser);
    assert(
      hit.some((m) => m.studentCode === CODE),
      "the counter finds the student by their real code",
    );

    const wrongChar = STUDENT_CODE_ALPHABET[(STUDENT_CODE_ALPHABET.indexOf(CODE[2]!) + 1) % 31];
    const typo = CODE.slice(0, 2) + wrongChar + CODE.slice(3);
    assert(resolveStudentCode(typo) === null, `one character wrong is not a code (${typo})`);
    const missed = await lookupStudents(typo, centerStaffUser);
    assert(
      missed.length === 0,
      "…and the counter finds NOBODY for it — the defect this format exists to close",
    );

    const grouped = await lookupStudents(`${CODE.slice(0, 4)}-${CODE.slice(4)}`, centerStaffUser);
    assert(
      grouped.some((m) => m.studentCode === CODE),
      "the code as PRINTED on the card (grouped) resolves too",
    );

    console.log("\n-- the counter does not leak other centers' children --");

    const desk = su({ id: fx.teacher.id, role: "center_admin", centerId: fx.center.id });
    const strangerPhone = fx.student.phone as string;

    const byName = await lookupStudents(tag, desk);
    assert(
      byName.some((m) => m.studentId === fx.other.id),
      "free text finds a student on THIS center's roster",
    );
    assert(
      byName.every((m) => m.onOurRoster),
      "…and finds NOBODY off it — a name fragment is evidence of nothing",
    );
    const ours = byName.find((m) => m.studentId === fx.other.id)!;
    assert(
      ours.name?.includes(tag) === true && ours.phone !== null,
      "our own student comes back in full — the center already holds that data",
    );
    assert(ours.studentId === fx.other.id, "our own student keeps a usable id");

    const fragment = strangerPhone.slice(0, 5);
    const byFragment = await lookupStudents(fragment, desk);
    assert(
      byFragment.every((m) => m.onOurRoster),
      `a ${fragment.length}-digit fragment resolves nobody off-roster`,
    );

    const byCode = await lookupStudents(CODE, desk);
    const stranger = byCode.find((m) => !m.onOurRoster);
    assert(stranger !== undefined, "a valid code still reaches a student at another center");
    assert(
      stranger!.name !== null && !stranger!.name.includes(tag),
      `their name comes back MASKED (${stranger!.name})`,
    );
    assert(
      stranger!.phone !== null && !stranger!.phone.includes(strangerPhone.slice(0, -4)),
      `their phone comes back as last-4 only (${stranger!.phone})`,
    );
    assert(
      stranger!.phone!.endsWith(strangerPhone.slice(-4)),
      "…keeping the last four, which is what a human confirms against",
    );
    assert(
      stranger!.studentCode === CODE,
      "the code IS echoed back — they typed it, so it discloses nothing new",
    );
    assert(stranger!.onOurRoster === false, "and the row is labelled as not ours");
    assert(
      stranger!.studentId === null,
      "the real student id is WITHHELD — a match here cannot be replayed against an id endpoint",
    );
    assert(
      stranger!.otherCenterCount === 1,
      `we learn only HOW MANY other centres hold them (${stranger!.otherCenterCount})`,
    );
    assert(
      !JSON.stringify(stranger).includes(`${tag}-rival`),
      "…and never WHICH: no centre name appears anywhere in the row",
    );

    const byPhone = await lookupStudents(strangerPhone, desk);
    const viaPhone = byPhone.find((m) => !m.onOurRoster);
    assert(viaPhone !== undefined, "a full phone number also reaches them — the dedup case");
    assert(
      viaPhone!.studentCode === null,
      "…but their CODE is withheld: reached by phone, the code would be new information",
    );

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
    await admin.query(`DELETE FROM center_student_rosters WHERE student_id = ANY($1::uuid[])`, [U]);
    await admin.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [[fx.center.id, fx.rivalCenter.id]]);
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

assertDbEnv(["test"], { intent: "suite student-id-card.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
