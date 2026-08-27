import { withPlatformContext } from "@repo/database";
import {
  getGlobalCommission,
  updateGlobalCommission,
} from "@/lib/services/settings/commission-admin";
import type { SessionUser } from "@/lib/auth/session";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "commission-audit.test.ts";

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
  const tag = "commaud-" + rid();
  __sweepTag = tag;
  console.log("Commission audit DB test —", tag);

  const su = await withPlatformContext(async (tx) => {
    const u = await tx.user.create({
      data: { name: `${tag}-su`, role: "super_admin", email: `${tag}-su@x.io`, status: "active" },
    });
    return u.id;
  });
  const suUser = { id: su, role: "super_admin" } as SessionUser;

  const original = await getGlobalCommission();
  console.log(
    `\n  original: ${original.teacherDirectCommissionBp}bp / ` +
      `${original.platformTeacherFee} / ${original.platformCenterFee}`,
  );

  const next = {
    teacherDirectCommissionBp: 1234,
    platformTeacherFee: 250,
    platformCenterFee: 275,
  };
  const row = await updateGlobalCommission(next, suUser);

  console.log("\nVP1 — the save is audited to the acting superadmin");
  const rows = await withPlatformContext((tx) =>
    tx.auditLog.findMany({
      where: { action: "commission.global.updated", actorId: su },
      orderBy: { createdAt: "desc" },
    }),
  );
  assert(rows.length === 1, `exactly one audit row for this actor (got ${rows.length})`);
  assert(
    rows[0]?.targetType === "commission_setting" && rows[0]?.targetId === row.id,
    "audit row points at the global commission_setting row",
  );

  console.log("\nVP2 — the row carries before AND after");
  const state = (rows[0]?.afterState ?? {}) as {
    before?: Record<string, number> | null;
    after?: Record<string, number>;
  };
  assert(
    state.before?.teacherDirectCommissionBp === original.teacherDirectCommissionBp &&
      state.before?.platformTeacherFee === original.platformTeacherFee &&
      state.before?.platformCenterFee === original.platformCenterFee,
    `before = the rates that were charged until now (${JSON.stringify(state.before)})`,
  );
  assert(
    state.after?.teacherDirectCommissionBp === next.teacherDirectCommissionBp &&
      state.after?.platformTeacherFee === next.platformTeacherFee &&
      state.after?.platformCenterFee === next.platformCenterFee,
    `after = the rates saved (${JSON.stringify(state.after)})`,
  );

  console.log("\nVP3 — one row per save, not two");
  await updateGlobalCommission(
    {
      teacherDirectCommissionBp: original.teacherDirectCommissionBp ?? 1500,
      platformTeacherFee: original.platformTeacherFee ?? 200,
      platformCenterFee: original.platformCenterFee ?? 200,
    },
    suUser,
  );
  const after2 = await withPlatformContext((tx) =>
    tx.auditLog.count({ where: { action: "commission.global.updated", actorId: su } }),
  );
  assert(after2 === 2, `two saves → two audit rows, no duplicates (got ${after2})`);

  const restored = await getGlobalCommission();
  assert(
    restored.teacherDirectCommissionBp === original.teacherDirectCommissionBp &&
      restored.platformTeacherFee === original.platformTeacherFee &&
      restored.platformCenterFee === original.platformCenterFee,
    "original rates restored",
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
