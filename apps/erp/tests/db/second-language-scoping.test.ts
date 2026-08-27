import { testPool } from "../../../../packages/database/scripts/test-pool";
import { prisma, withPlatformContext } from "@repo/database";
import { getSubjectsForSelection, getStudentOwnSubjects } from "@/lib/services/catalog/catalog-read";
import { filterStudentSecondLanguage } from "@/lib/services/catalog/second-language";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const adminPool = testPool();

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

const SUFFIX = `lang2-${Date.now().toString(36)}`;
const LANG_CODES = ["lang2-french", "lang2-german", "lang2-italian", "lang2-spanish"];

async function main() {
  const userIds: string[] = [];

  try {
    const fx = await withPlatformContext(async (tx) => {
      const byCode = async <M extends "gradeLevel" | "track" | "subject">(model: M, code: string) => {
        const row = await (
          tx as never as Record<string, { findUnique: (a: object) => Promise<{ id: string } | null> }>
        )[model].findUnique({ where: { code } });
        if (!row) throw new Error(`fixture missing: ${model} ${code}`);
        return row.id;
      };
      const langIds = new Map<string, string>();
      for (const code of LANG_CODES) langIds.set(code, await byCode("subject", code));

      const student = await tx.user.create({
        data: { email: `s-${SUFFIX}@test.eg`, name: "Lang Student", role: "student", passwordHash: "x" },
      });
      const skipper = await tx.user.create({
        data: { email: `k-${SUFFIX}@test.eg`, name: "Skip Student", role: "student", passwordHash: "x" },
      });

      const g3Id = await byCode("gradeLevel", "general-secondary-3");
      const sciMathId = await byCode("track", "general-sci-math");

      await tx.studentProfile.create({
        data: {
          userId: student.id,
          fullName: student.name,
          familyLinkCode: `${SUFFIX.toUpperCase()}A`.slice(0, 20),
          gradeLevelId: g3Id,
          trackId: sciMathId,
          secondLanguageSubjectId: langIds.get("lang2-french")!,
        },
      });
      await tx.studentProfile.create({
        data: {
          userId: skipper.id,
          fullName: skipper.name,
          familyLinkCode: `${SUFFIX.toUpperCase()}B`.slice(0, 20),
          gradeLevelId: g3Id,
          trackId: sciMathId,
          secondLanguageSubjectId: null,
        },
      });

      return { student, skipper, g3Id, sciMathId, langIds };
    });
    userIds.push(fx.student.id, fx.skipper.id);

    const french = fx.langIds.get("lang2-french")!;
    const german = fx.langIds.get("lang2-german")!;

    console.log("\n0) The grade really does offer the whole language menu");
    const allTrackSubjects = await getSubjectsForSelection(fx.g3Id, fx.sciMathId);
    const offeredLangs = allTrackSubjects.filter((s) => s.isSecondLanguage);
    assert(
      offeredLangs.length === LANG_CODES.length,
      `grade offers all ${LANG_CODES.length} second languages (got ${offeredLangs.length}) — the pre-fix bug`,
    );
    const nonLangIds = allTrackSubjects.filter((s) => !s.isSecondLanguage).map((s) => s.id).sort();

    console.log("\n1) A student who picked French");
    const mine = await getStudentOwnSubjects(fx.student.id);
    const mineLangs = mine.filter((s) => s.isSecondLanguage);
    assert(mineLangs.length === 1, `exactly ONE second language listed (got ${mineLangs.length})`);
    assert(mineLangs[0]?.id === french, "the one listed IS the picked language (French)");
    assert(
      !mine.some((s) => s.isSecondLanguage && s.id !== french),
      "German / Italian / Spanish are NOT in the student's own list",
    );
    assert(
      JSON.stringify(mine.filter((s) => !s.isSecondLanguage).map((s) => s.id).sort()) ===
        JSON.stringify(nonLangIds),
      "every NON-language track subject is still there (nothing else filtered)",
    );

    console.log("\n2) Switching the pick to German");
    await withPlatformContext((tx) =>
      tx.studentProfile.update({
        where: { userId: fx.student.id },
        data: { secondLanguageSubjectId: german },
      }),
    );
    const afterSwitch = await getStudentOwnSubjects(fx.student.id);
    const switchedLangs = afterSwitch.filter((s) => s.isSecondLanguage);
    assert(switchedLangs.length === 1 && switchedLangs[0]?.id === german, "now German only");
    assert(!afterSwitch.some((s) => s.id === french), "French is gone after the switch");
    assert(
      JSON.stringify(afterSwitch.filter((s) => !s.isSecondLanguage).map((s) => s.id).sort()) ===
        JSON.stringify(nonLangIds),
      "non-language subjects unchanged by the switch",
    );

    console.log("\n3) A student who skipped the second-language step");
    const skipped = await getStudentOwnSubjects(fx.skipper.id);
    assert(
      skipped.filter((s) => s.isSecondLanguage).length === 0,
      "NO second language is listed (skipping means none, not all)",
    );
    assert(
      JSON.stringify(skipped.map((s) => s.id).sort()) === JSON.stringify(nonLangIds),
      "the skipper still gets the full non-language subject list",
    );

    console.log("\n4) Onboarding preview and the API share ONE rule");
    const previewed = filterStudentSecondLanguage(allTrackSubjects, german);
    assert(
      JSON.stringify(previewed.map((s) => s.id).sort()) ===
        JSON.stringify(afterSwitch.map((s) => s.id).sort()),
      "wizard preview output === the API's own-subjects output for the same pick",
    );
  } finally {
    const c = await adminPool.connect();
    try {
      await c.query(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [userIds]);
      await c.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[])`, [userIds]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
    } finally {
      c.release();
      await adminPool.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite second-language-scoping.test.ts" })
  .then(() => main()).catch(async (e) => {
  console.error(e);
  try {
    await adminPool.end();
  } catch {
  }
  process.exit(1);
});
