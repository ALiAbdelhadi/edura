import { withPlatformContext } from "@repo/database";
import {
  AFFILIATION_ONE_LIVE,
  PARENT_LINK_ONE_LIVE,
  WALLET_SETTINGS_ONE_ROW,
} from "@repo/server-core/db/unique-indexes";
import { linkTeacherCenter, linkParent, unlinkTeacherCenter, unlinkParent } from "@/lib/services/admin/platform";
import { getWalletPolicy, updateWalletPolicy } from "@/lib/services/settings/wallet-settings-admin";
import type { SessionUser } from "@/lib/auth/session";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "c04-dedupe-guards.test.ts";

/*
 * wallet_settings is a PLATFORM-WIDE SINGLETON, so VP7 cannot own a private
 * copy the way every other fixture here does -- proving that two concurrent
 * FIRST saves converge requires the table to be empty, and there is only one
 * table. So it borrows the real row, and this holds what must be put back.
 *
 * The restore lives in runGuarded's finally rather than inline at the end of
 * VP7: if anything in between throws, an inline restore never runs and the
 * platform policy stays DELETED. Nothing would announce that -- getWalletPolicy
 * falls back to DEFAULTS -- so every later suite would quietly run against
 * different top-up bounds.
 */
let __walletPolicyBackup: { id: string | null; minTopup: number; maxTopup: number } | null = null;
let __restoreActorId = "";

async function restoreWalletPolicy(suUser: SessionUser) {
  const backup = __walletPolicyBackup;
  if (!backup) return;
  __walletPolicyBackup = null;
  if (backup.id) {
    await updateWalletPolicy({ minTopup: backup.minTopup, maxTopup: backup.maxTopup }, suUser);
  } else {
    await withPlatformContext((tx) => tx.walletSettings.deleteMany({}));
  }
}

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
const msg = (r: PromiseSettledResult<unknown>) =>
  r.status === "rejected" ? ((r.reason as Error)?.message ?? "") : "";

async function main() {
  const tag = "c04dg-" + rid();
  __sweepTag = tag;
  console.log("C-4 dedupe guards —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const mk = (role: "super_admin" | "teacher" | "parent" | "student", k: string) =>
      tx.user.create({
        data: { name: `${tag}-${k}`, role, email: `${tag}-${k}@x.io`, status: "active" },
      });
    const [admin, teacher, teacherB, parent, parentB, student] = await Promise.all([
      mk("super_admin", "su"),
      mk("teacher", "t"),
      mk("teacher", "tb"),
      mk("parent", "p"),
      mk("parent", "pb"),
      mk("student", "s"),
    ]);
    const center = await tx.center.create({
      data: { name: `${tag}-center`, shortId: `${tag}`.slice(0, 12).toUpperCase(), subjects: [] },
    });
    return {
      admin: admin.id,
      teacher: teacher.id,
      teacherB: teacherB.id,
      parent: parent.id,
      parentB: parentB.id,
      student: student.id,
      center: center.id,
    };
  });
  const suUser = { id: fx.admin, role: "super_admin" } as SessionUser;
  __restoreActorId = fx.admin;

  console.log("\nVP1 — the three indexes exist, are UNIQUE and are VALID");
  const idx = await withPlatformContext(
    (tx) => tx.$queryRaw<{ idx: string; indisunique: boolean; indisvalid: boolean }[]>`
      SELECT indexrelid::regclass::text AS idx, indisunique, indisvalid
        FROM pg_index
       WHERE indexrelid::regclass::text IN (
         ${AFFILIATION_ONE_LIVE}, ${PARENT_LINK_ONE_LIVE}, ${WALLET_SETTINGS_ONE_ROW})`,
  );
  for (const name of [AFFILIATION_ONE_LIVE, PARENT_LINK_ONE_LIVE, WALLET_SETTINGS_ONE_ROW]) {
    const row = idx.find((r) => r.idx === name);
    assert(
      !!row && row.indisunique && row.indisvalid,
      `${name} exists, unique and valid${row ? "" : " (MISSING — migration 20260902120000_dedupe_guards not applied?)"}`,
    );
  }

  console.log("\nVP2 — two concurrent linkTeacherCenter calls leave exactly ONE live affiliation");
  const auditBefore = await withPlatformContext((tx) =>
    tx.auditLog.count({ where: { action: "teacher.linked_center", targetId: fx.teacher } }),
  );
  const affRace = await Promise.allSettled([
    linkTeacherCenter(fx.teacher, fx.center, fx.admin),
    linkTeacherCenter(fx.teacher, fx.center, fx.admin),
  ]);
  const affWon = affRace.filter((r) => r.status === "fulfilled").length;
  const affLost = affRace.filter((r) => r.status === "rejected");
  const affLive = await withPlatformContext((tx) =>
    tx.centerTeacherAffiliation.count({
      where: { teacherId: fx.teacher, centerId: fx.center, status: { in: ["pending", "active"] } },
    }),
  );
  assert(affWon === 1 && affLost.length === 1, `exactly one call won (won ${affWon}, lost ${affLost.length})`);
  assert(affLive === 1, `exactly ONE live affiliation row in the database (found ${affLive})`);
  assert(
    affLost.some((r) => msg(r).includes("already linked to this center")),
    `the loser reads the domain message, not a bare constraint error (got: "${msg(affLost[0] ?? affRace[0]).slice(0, 90)}")`,
  );

  console.log("\nVP3 — the losing transaction rolled back whole: no orphan audit row");
  const auditAfter = await withPlatformContext((tx) =>
    tx.auditLog.count({ where: { action: "teacher.linked_center", targetId: fx.teacher } }),
  );
  assert(
    auditAfter - auditBefore === 1,
    `exactly one audit row for the one link that happened (delta ${auditAfter - auditBefore})`,
  );

  console.log("\nVP4 — the index is PARTIAL: it constrains live rows only");
  const other = await linkTeacherCenter(fx.teacherB, fx.center, fx.admin)
    .then(() => true)
    .catch(() => false);
  assert(other, "a DIFFERENT teacher at the same centre is unaffected");

  await unlinkTeacherCenter(fx.teacher, fx.center, fx.admin);
  const reinvited = await linkTeacherCenter(fx.teacher, fx.center, fx.admin)
    .then(() => true)
    .catch((e: Error) => e.message);
  assert(
    reinvited === true,
    `a REMOVED teacher can be re-linked — terminal states stay repeatable (${reinvited})`,
  );

  console.log("\nVP5 — two concurrent linkParent calls leave exactly ONE live guardian link");
  const linkRace = await Promise.allSettled([
    linkParent(fx.student, fx.parent, fx.admin),
    linkParent(fx.student, fx.parent, fx.admin),
  ]);
  const linkWon = linkRace.filter((r) => r.status === "fulfilled").length;
  const linkLost = linkRace.filter((r) => r.status === "rejected");
  const linkLive = await withPlatformContext((tx) =>
    tx.parentStudentLink.count({
      where: { studentId: fx.student, parentId: fx.parent, status: { in: ["pending", "approved"] } },
    }),
  );
  assert(linkWon === 1 && linkLost.length === 1, `exactly one call won (won ${linkWon}, lost ${linkLost.length})`);
  assert(linkLive === 1, `exactly ONE live parent link in the database (found ${linkLive})`);
  assert(
    linkLost.some((r) => msg(r).includes("already linked to this student")),
    `the loser reads the domain message (got: "${msg(linkLost[0] ?? linkRace[0]).slice(0, 90)}")`,
  );

  console.log("\nVP6 — the parent index is PARTIAL too");
  const otherParent = await linkParent(fx.student, fx.parentB, fx.admin)
    .then(() => true)
    .catch(() => false);
  assert(otherParent, "a DIFFERENT parent for the same student is unaffected");

  const live = await withPlatformContext((tx) =>
    tx.parentStudentLink.findFirst({
      where: { studentId: fx.student, parentId: fx.parent, status: "approved" },
      select: { id: true },
    }),
  );
  await unlinkParent(live!.id, fx.student, fx.admin);
  const relinked = await linkParent(fx.student, fx.parent, fx.admin)
    .then(() => true)
    .catch((e: Error) => e.message);
  assert(relinked === true, `a REVOKED parent can be re-linked (${relinked})`);

  console.log("\nVP7 — wallet_settings is a singleton, and a first-save race CONVERGES");
  const original = await getWalletPolicy();
  __walletPolicyBackup = original;
  await withPlatformContext((tx) => tx.walletSettings.deleteMany({}));
  const emptied = await withPlatformContext((tx) => tx.walletSettings.count());
  assert(emptied === 0, "starting from zero policy rows — the state a first save races in");

  const policyRace = await Promise.allSettled([
    updateWalletPolicy({ minTopup: 1100, maxTopup: 111100 }, suUser),
    updateWalletPolicy({ minTopup: 2200, maxTopup: 222200 }, suUser),
  ]);
  const policyWon = policyRace.filter((r) => r.status === "fulfilled").length;
  const rows = await withPlatformContext((tx) => tx.walletSettings.count());
  const inForce = await getWalletPolicy();
  assert(rows === 1, `exactly ONE wallet_settings row after the race (found ${rows})`);
  assert(
    policyWon === 2,
    `BOTH saves succeeded — the loser retried onto the winner's row instead of erroring ` +
      `(fulfilled ${policyWon}${policyWon < 2 ? `, rejected: "${msg(policyRace.find((r) => r.status === "rejected")!).slice(0, 90)}"` : ""})`,
  );
  assert(
    (inForce.minTopup === 1100 && inForce.maxTopup === 111100) ||
      (inForce.minTopup === 2200 && inForce.maxTopup === 222200),
    `the policy in force is one of the two submitted, not a blend (${inForce.minTopup}/${inForce.maxTopup})`,
  );

  await restoreWalletPolicy(suUser);
  const restored = await getWalletPolicy();
  assert(
    restored.minTopup === original.minTopup && restored.maxTopup === original.maxTopup,
    `original policy restored (${original.minTopup}/${original.maxTopup})`,
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
    if (__walletPolicyBackup) {
      console.error("  ! restoring the platform wallet policy after an aborted run");
      await restoreWalletPolicy({ id: __restoreActorId, role: "super_admin" } as SessionUser).catch(
        (e) => console.error("  ! FAILED to restore the wallet policy:", e),
      );
    }
    if (__sweepTag) await sweepTagQuietly(__sweepTag);
  }
  process.exit(process.exitCode ?? 0);
}

runGuarded().catch((e) => {
  console.error(e);
  process.exit(1);
});
