/**
 * unlinkParent — the link must belong to the student in the URL (L-7).
 *
 * The bug this locks down: the service selected the link by `linkId` ALONE and
 * the route awaited `ctx.params` only to discard it. So
 *
 *     DELETE /api/v1/admin/students/<A>/unlink-parent?linkId=<B's link>
 *
 * returned 200, revoked student B's parent link, and wrote a
 * `student.unlinked_parent` audit row for an action whose URL named student A.
 * Measured over HTTP 2026-08-18.
 *
 * Not a privilege hole — a super_admin may unlink any link — but it leaves the
 * audit trail unable to reconstruct what was intended, and a parent link is
 * precisely what the messaging guardian gate consults for a minor, so severing
 * the wrong one has child-safety consequences.
 *
 * Proves:
 *  1. a linkId that belongs to ANOTHER student is refused, and that student's
 *     link is left untouched (no partial mutation, no audit row);
 *  2. the correct student still unlinks normally;
 *  3. an already-revoked link is still refused (the pre-existing guard).
 *
 * Run (all suites, guarded):  bun run --filter superadmin test:db
 * Run (this one only):        bun run --filter superadmin test:db:only unlink-parent-scope
 * NEVER --env-file=.env.local: that is the DEV database and it skips the guard.
 */
import { withPlatformContext } from "@repo/database";
import { unlinkParent } from "@/lib/services/admin/platform";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "unlink-parent-scope.test.ts";

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
    assert(false, `${label} (did NOT throw — the action was allowed)`);
  } catch (e) {
    assert(true, `${label} (threw: ${(e as Error).message.slice(0, 55)})`);
  }
}

const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function main() {
  const tag = "unlinkscope-" + rid();
  __sweepTag = tag;
  console.log("unlinkParent scope DB tests —", tag);

  // Two unrelated parent/student pairs, each with an approved link.
  const fx = await withPlatformContext(async (tx) => {
    const admin = await tx.user.create({
      data: { name: `${tag}-admin`, role: "super_admin", email: `${tag}-admin@x.io`, status: "active" },
    });
    const mkPair = async (k: string) => {
      const parent = await tx.user.create({
        data: { name: `${tag}-${k}-parent`, role: "parent", email: `${tag}-${k}-parent@x.io`, status: "active" },
      });
      const student = await tx.user.create({
        data: { name: `${tag}-${k}-student`, role: "student", email: `${tag}-${k}-student@x.io`, status: "active" },
      });
      await tx.studentProfile.create({
        data: {
          userId: student.id,
          fullName: `${tag}-${k}-student`,
          entityType: "invited",
          inviteCode: (tag + k + "I").toUpperCase().slice(0, 20),
          familyLinkCode: (tag + k + "F").toUpperCase().slice(0, 20),
          walletBalance: 0,
        },
      });
      const link = await tx.parentStudentLink.create({
        data: { parentId: parent.id, studentId: student.id, status: "approved", initiatedBy: "parent" },
      });
      return { parentId: parent.id, studentId: student.id, linkId: link.id };
    };
    return { adminId: admin.id, A: await mkPair("a"), B: await mkPair("b") };
  });

  const auditCount = () =>
    withPlatformContext((tx) =>
      tx.auditLog.count({ where: { action: "student.unlinked_parent", targetId: fx.B.studentId } }),
    );

  console.log("\n[1] a link belonging to ANOTHER student is refused");
  const auditBefore = await auditCount();
  await expectThrows(
    // student A named in the path, but B's link id supplied
    () => unlinkParent(fx.B.linkId, fx.A.studentId, fx.adminId),
    "unlinkParent(B's link, student A) is refused",
  );
  const bStatus = await withPlatformContext((tx) =>
    tx.parentStudentLink.findUnique({ where: { id: fx.B.linkId }, select: { status: true } }),
  );
  assert(bStatus?.status === "approved", "student B's link is untouched (still approved)");
  assert(
    (await auditCount()) === auditBefore,
    "and NO audit row was written for the refused action",
  );

  console.log("\n[2] the correct student unlinks normally");
  const revoked = await unlinkParent(fx.B.linkId, fx.B.studentId, fx.adminId);
  assert(revoked.status === "revoked", "unlinkParent(B's link, student B) revokes it");
  assert(
    (await auditCount()) === auditBefore + 1,
    "…and writes exactly one audit row for the student that was actually affected",
  );

  console.log("\n[3] the pre-existing guard still holds");
  await expectThrows(
    () => unlinkParent(fx.B.linkId, fx.B.studentId, fx.adminId),
    "an already-revoked link cannot be revoked twice",
  );
  await expectThrows(
    () => unlinkParent("00000000-0000-4000-8000-000000000000", fx.A.studentId, fx.adminId),
    "a non-existent linkId is refused",
  );

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
