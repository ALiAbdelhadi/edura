/* eslint-disable no-console */
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
