/**
 * Student-wallet policy (superadmin) — the top-up bounds are now MANAGED, not
 * hand-written SQL. Proves:
 *  VP1  the screen reads the live singleton row.
 *  VP2  a superadmin save takes effect immediately in the money engine
 *       (assertTopupAllowed accepts what was just allowed, rejects what was
 *       just forbidden) — the same guard the online intent + center cash use.
 *  VP3  the write is audited to the acting superadmin.
 *  VP4  invalid bounds are rejected (max < min, zero/negative, absurd max).
 *  VP5  the removed balance cap stays removed — no cap is written or read back.
 *
 * Restores the original bounds at the end (this touches the GLOBAL policy row).
 *
 * Run: pnpm --filter superadmin exec tsx --env-file=.env.local tests/db/wallet-settings-admin.test.ts
 */
import { withPlatformContext } from "@repo/database";
import { assertTopupAllowed, getWalletSettings } from "@repo/server-core/services/wallet/wallet";
import { getWalletPolicy, updateWalletPolicy } from "@/lib/services/settings/wallet-settings-admin";
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
async function expectThrows(fn: () => Promise<unknown>, match: string, msg: string) {
  try {
    await fn();
    assert(false, `${msg} (did not throw)`);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    assert(m.includes(match), `${msg} (threw: ${m.slice(0, 120)})`);
  }
}

const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function allowed(studentId: string, amount: number) {
  try {
    await withPlatformContext((tx) => assertTopupAllowed(tx, studentId, amount));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const tag = "wpol-" + rid();
  console.log("Wallet policy admin DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const su = await tx.user.create({
      data: { name: `${tag}-su`, role: "super_admin", email: `${tag}-su@x.io`, status: "active" },
    });
    const student = await tx.user.create({
      data: { name: `${tag}-s`, role: "student", email: `${tag}-s@x.io`, status: "active" },
    });
    await tx.studentProfile.create({
      data: {
        userId: student.id,
        fullName: `${tag}-s`,
        familyLinkCode: (tag + rid() + "00").slice(0, 18),
        walletBalance: 0,
      },
    });
    return { su: su.id, student: student.id };
  });
  const suUser = { id: fx.su, role: "super_admin" } as SessionUser;

  const original = await getWalletPolicy();

  // ---------------------------------------------------------------- VP1
  console.log("\nVP1 — the screen reads the live policy row");
  const engine = await withPlatformContext((tx) => getWalletSettings(tx));
  assert(
    original.minTopup === engine.minTopup && original.maxTopup === engine.maxTopup,
    `screen and money engine read the SAME bounds (${original.minTopup}/${original.maxTopup})`,
  );

  // ---------------------------------------------------------------- VP2
  console.log("\nVP2 — a save takes effect immediately in the money engine");
  const before = await allowed(fx.student, 9000_00); // 9000 EGP — above the 5000 default
  await updateWalletPolicy({ minTopup: 5000, maxTopup: 10000_00 }, suUser);
  const after = await allowed(fx.student, 9000_00);
  const belowNewMin = await allowed(fx.student, 2000); // 20 EGP, under the new 50 EGP floor
  const aboveNewMax = await allowed(fx.student, 10001_00);
  assert(!before, "9000 EGP top-up was rejected under the OLD 5000 EGP maximum");
  assert(after, "9000 EGP top-up is accepted right after raising the maximum to 10000 EGP");
  assert(!belowNewMin, "20 EGP now rejected — the raised 50 EGP minimum applies");
  assert(!aboveNewMax, "10001 EGP still rejected — the new maximum is enforced");

  // ---------------------------------------------------------------- VP3
  console.log("\nVP3 — the write is audited");
  const audit = await withPlatformContext((tx) =>
    tx.auditLog.findFirst({
      where: { action: "wallet_settings.updated" },
      orderBy: { createdAt: "desc" },
    }),
  );
  const afterState = (audit?.afterState ?? {}) as Record<string, unknown>;
  assert(!!audit && audit.actorId === fx.su, "audit row records the acting superadmin");
  assert(
    afterState.minTopup === 5000 && afterState.maxTopup === 10000_00,
    `audit records the saved bounds (${JSON.stringify(afterState)})`,
  );

  // ---------------------------------------------------------------- VP4
  console.log("\nVP4 — invalid bounds rejected");
  await expectThrows(
    () => updateWalletPolicy({ minTopup: 20000, maxTopup: 10000 }, suUser),
    "cannot be lower than the minimum",
    "max below min rejected",
  );
  await expectThrows(
    () => updateWalletPolicy({ minTopup: 0, maxTopup: 10000 }, suUser),
    "Minimum top-up must be",
    "zero minimum rejected",
  );
  await expectThrows(
    () => updateWalletPolicy({ minTopup: 1000, maxTopup: 1000.5 }, suUser),
    "Maximum top-up must be",
    "fractional piasters rejected",
  );
  await expectThrows(
    () => updateWalletPolicy({ minTopup: 1000, maxTopup: 100_000_001 }, suUser),
    "cannot exceed",
    "absurd maximum rejected",
  );
  const stillThere = await getWalletPolicy();
  assert(
    stillThere.minTopup === 5000 && stillThere.maxTopup === 10000_00,
    "a rejected save changed nothing",
  );

  // ---------------------------------------------------------------- VP5
  console.log("\nVP5 — the removed balance cap stays removed");
  const raw = await withPlatformContext((tx) =>
    tx.walletSettings.findFirst({ select: { maxBalance: true } }),
  );
  assert(raw?.maxBalance == null, "max_balance is still NULL after a policy save");
  assert(
    !("maxBalance" in (await getWalletPolicy())),
    "the admin surface exposes no balance cap to set",
  );

  // ------------------------------------------------------------- restore
  await updateWalletPolicy(
    { minTopup: original.minTopup, maxTopup: original.maxTopup },
    suUser,
  );
  const restored = await getWalletPolicy();
  assert(
    restored.minTopup === original.minTopup && restored.maxTopup === original.maxTopup,
    `original bounds restored (${original.minTopup}/${original.maxTopup})`,
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
