import { withPlatformContext } from "@repo/database";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "wallet-no-cap.test.ts";

import {
  assertTopupAllowed,
  getWalletSettings,
  walletCredit,
} from "@repo/server-core/services/wallet/wallet";

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

async function mkStudent(tag: string, balance = 0) {
  return withPlatformContext(async (tx) => {
    const u = await tx.user.create({
      data: { name: `${tag}-s`, role: "student", email: `${tag}-s@x.io`, status: "active" },
    });
    await tx.studentProfile.create({
      data: {
        userId: u.id,
        fullName: `${tag}-s`,
        familyLinkCode: (tag + rid() + "00").slice(0, 18),
        walletBalance: balance,
      },
    });
    return u.id;
  });
}

async function allowed(studentId: string, amount: number) {
  try {
    await withPlatformContext((tx) => assertTopupAllowed(tx, studentId, amount));
    return { ok: true, msg: "" };
  } catch (e) {
    return { ok: false, msg: (e as Error).message };
  }
}

async function main() {
  const tag = "nocap-" + rid();
  __sweepTag = tag;
  console.log("Student wallet — no balance cap —", tag);

  const settings = await withPlatformContext((tx) => getWalletSettings(tx));
  const raw = await withPlatformContext((tx) =>
    tx.walletSettings.findFirst({ select: { maxBalance: true } }),
  );
  console.log(
    `\n  settings: minTopup=${settings.minTopup} maxTopup=${settings.maxTopup}` +
      ` | inert max_balance column = ${raw?.maxBalance ?? "NULL"}`,
  );
  assert(
    !("maxBalance" in settings),
    "getWalletSettings no longer returns a balance cap",
  );

  console.log("\nProof 1 — a top-up past the OLD 500 EGP cap is allowed");
  const s1 = await mkStudent(tag + "-1", 0);
  const r1 = await allowed(s1, 400_00); // 400 EGP, then...
  const r2 = await allowed(s1, 4000_00); // 4000 EGP — 8× the old cap
  assert(r1.ok, "400 EGP top-up allowed");
  assert(r2.ok, `4000 EGP top-up allowed (old cap was 500 EGP) — ${r2.msg || "no error"}`);

  console.log("\nProof 2 — a balance ALREADY over the old cap can still top up");
  const s2 = await mkStudent(tag + "-2", 0);
  await withPlatformContext((tx) =>
    walletCredit(tx, s2, 3000_00, { type: "topup", method: "cash", reason: "over-old-cap" }),
  );
  const bal = await withPlatformContext(async (tx) => {
    const p = await tx.studentProfile.findUnique({
      where: { userId: s2 },
      select: { walletBalance: true },
    });
    return p!.walletBalance;
  });
  const r3 = await allowed(s2, 2000_00);
  assert(bal === 3000_00, `balance sits at 3000 EGP, well past the old cap (got ${bal / 100})`);
  assert(r3.ok, `another 2000 EGP top-up allowed on top — ${r3.msg || "no error"}`);

  console.log("\nProof 3 — per-transaction min/max top-up bounds still enforced");
  const r4 = await allowed(s1, settings.minTopup - 1);
  const r5 = await allowed(s1, settings.maxTopup + 1);
  assert(!r4.ok && /Minimum top-up/.test(r4.msg), `below min rejected (${r4.msg})`);
  assert(!r5.ok && /Maximum top-up/.test(r5.msg), `above max rejected (${r5.msg})`);

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
