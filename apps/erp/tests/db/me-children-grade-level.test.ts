import { withPlatformContext } from "@repo/database";
import { listChildren } from "@repo/server-core/services/parent-links/parent-links";
import type { SessionUser } from "@repo/server-core/erp-auth/session";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "me-children-grade-level.test.ts";

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

const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function main() {
  const tag = "mcgl-" + rid();
  __sweepTag = tag;
  console.log("me/children grade-level DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const gradeLevel = await tx.gradeLevel.findFirst({ select: { id: true, nameAr: true } });
    if (!gradeLevel) throw new Error("catalog missing a grade level — is this a seeded database?");

    const parent = await tx.user.create({
      data: { name: `${tag}-parent`, role: "parent", email: `${tag}-p@x.io`, status: "active" },
    });
    const onboarded = await tx.user.create({
      data: { name: `${tag}-child1`, role: "student", email: `${tag}-c1@x.io`, status: "active" },
    });
    await tx.studentProfile.create({
      data: {
        userId: onboarded.id, fullName: `${tag}-child1`, phone: `+2010${tag.replace(/\D/g, "").padEnd(8, "5").slice(0, 8)}`,
        familyLinkCode: (tag + "f1").slice(0, 18), entityType: "registered", pointsBalance: 0,
        gradeLevelId: gradeLevel.id,
      },
    });
    const shell = await tx.user.create({
      data: { name: `${tag}-child2`, role: "student", email: `${tag}-c2@x.io`, status: "active" },
    });
    const unlinked = await tx.user.create({
      data: { name: `${tag}-child3`, role: "student", email: `${tag}-c3@x.io`, status: "active" },
    });
    for (const [child, status] of [
      [onboarded.id, "approved"],
      [shell.id, "approved"],
      [unlinked.id, "pending"],
    ] as const) {
      await tx.parentStudentLink.create({
        data: { parentId: parent.id, studentId: child, status, initiatedBy: "parent" },
      });
    }
    return { parent: parent.id, onboarded: onboarded.id, shell: shell.id, unlinked: unlinked.id,
      gradeLevelId: gradeLevel.id, nameAr: gradeLevel.nameAr };
  });

  const children = await listChildren({ id: fx.parent, role: "parent" } as SessionUser);
  const byId = new Map(children.map((c) => [c.id, c]));

  const c1 = byId.get(fx.onboarded);
  assert(c1?.gradeLevelId === fx.gradeLevelId, "an onboarded child carries their gradeLevelId");
  assert(c1?.gradeLevel?.nameAr === fx.nameAr, "…and the grade level's Arabic name, served");
  assert(typeof c1?.gradeLevel?.nameEn !== "undefined", "…with the English name beside it — the client picks the language");

  const c2 = byId.get(fx.shell);
  assert(c2 !== undefined && c2.gradeLevelId === null && c2.gradeLevel === null,
    "a not-yet-onboarded child answers null/null — honest, not fabricated");

  assert(!byId.has(fx.unlinked), "a pending link stays invisible — approved-only, unchanged");
  assert(c1?.name === `${tag}-child1` && typeof c1?.phone !== "undefined",
    "the original fields are unchanged around the new ones");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}

async function runGuarded() {
  await assertDbEnv(["test"], { intent: `suite ${SUITE_NAME}` });
  try {
    await main();
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (__sweepTag) await sweepTagQuietly(__sweepTag);
  }
  process.exit(process.exitCode ?? 0);
}

runGuarded().catch((e) => {
  console.error(e);
  process.exit(1);
});
