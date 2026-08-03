/* eslint-disable no-console */
/**
 * ============================================================================
 * FINALIZE STUDENT CODES — give every already-onboarded student their letter
 * ============================================================================
 * Migration 20260803110000_student_code_v2 rewrote the legacy `STU-000123`
 * codes into the new eight-character shape, but it could only give them the
 * PENDING letter `X`: the final body is derived from the student's profile id
 * with a SHA-256 digest, which SQL has no business reproducing (one derivation,
 * in one language — see student-code-issue.ts).
 *
 * New students never need this. It exists for the students who finished
 * onboarding BEFORE the migration ran, and it is the last step of applying it:
 *
 *     bun run db:finalize-codes            # dry run, prints what it would do
 *     bun run db:finalize-codes --write
 *
 * IDEMPOTENT: it only ever touches a code that still starts with 'X' and whose
 * student has an education system with a letter. Running it twice changes
 * nothing the second time, and it can never move a code that is already final —
 * that guarantee lives inside finalizeStudentCode(), not here.
 */
import "./load-env";
import { withPlatformContext } from "../src/index";
import { finalizeStudentCode } from "../src/queries/student-code-issue";
import { PENDING_SYSTEM_LETTER } from "../src/queries/student-code";

const write = process.argv.includes("--write");

async function main() {
  const pending = await withPlatformContext((tx) =>
    tx.studentProfile.findMany({
      where: {
        studentCode: { startsWith: PENDING_SYSTEM_LETTER },
        educationSystemId: { not: null },
      },
      select: {
        userId: true,
        fullName: true,
        studentCode: true,
        educationSystem: { select: { code: true, codeLetter: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  );

  const eligible = pending.filter((p) => p.educationSystem?.codeLetter && p.userId);
  console.log(
    `pending codes with a known education system: ${eligible.length}` +
      (pending.length !== eligible.length
        ? ` (${pending.length - eligible.length} skipped — their system has no letter)`
        : ""),
  );

  if (!write) {
    for (const p of eligible.slice(0, 20)) {
      console.log(`  would issue  ${p.studentCode} -> ${p.educationSystem?.codeLetter}…  ${p.fullName}`);
    }
    if (eligible.length > 20) console.log(`  … and ${eligible.length - 20} more`);
    console.log("\ndry run — pass --write to apply");
    return;
  }

  let changed = 0;
  for (const p of eligible) {
    const res = await withPlatformContext((tx) => finalizeStudentCode(tx, p.userId as string));
    if (res?.changed) {
      changed++;
      console.log(`  ${p.studentCode} -> ${res.studentCode}  ${p.fullName}`);
    }
  }
  console.log(`\nissued ${changed} code${changed === 1 ? "" : "s"}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit(0));
