/**
 * Global commission rates — the write is AUDITED (gap closed 2026-07-23).
 *
 * Every other write to commission_setting already logged itself (rooms-split.ts
 * → revenue_split.* / m2_rate.*); the global rates the money engine charges at
 * did not. Proves:
 *  VP1  a save writes ONE audit row attributed to the acting superadmin.
 *  VP2  the row carries BEFORE and AFTER (what the rates were, what they became).
 *  VP3  exactly one row per save — no double-logging from the model-level
 *       extension (CommissionSetting is deliberately not in AUDITED).
 *
 * Restores the original rates at the end (this touches the GLOBAL row).
 *
 * Run: pnpm --filter superadmin exec tsx --env-file=.env.local tests/db/commission-audit.test.ts
 */
import { withPlatformContext } from "@repo/database";
import {
  getGlobalCommission,
  updateGlobalCommission,
} from "@/lib/services/settings/commission-admin";
import type { SessionUser } from "@/lib/auth/session";

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

  // ---------------------------------------------------------------- VP1
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

  // ---------------------------------------------------------------- VP2
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

  // ---------------------------------------------------------------- VP3
  console.log("\nVP3 — one row per save, not two");
  // The columns are nullable (scope rows may set only the split columns); the
  // global row always has them, fall back to the service defaults regardless.
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
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
