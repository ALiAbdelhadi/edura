// SECURITY_AUDIT.md L-01 — the wallet ledger's running balance comes from the
// decrementing statement itself (UPDATE … RETURNING), so concurrent debits
// record distinct, consistent balances and reconcileWallet stays green.
import { withPlatformContext } from "@repo/database";
import { walletCredit, walletDebit, reconcileWallet } from "@repo/server-core/services/wallet/wallet";
import { parentWalletCredit, parentWalletDebit } from "@repo/server-core/services/wallet/parent-wallet";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function main() {
  const tag = "l01-" + rid(); __sweepTag = tag;
  const fx = await withPlatformContext(async (tx) => {
    const stu = await tx.user.create({ data: { name: `${tag}-stu`, role: "student", email: `${tag}-s@x.io`, status: "active" } });
    await tx.studentProfile.create({ data: { userId: stu.id, fullName: `${tag}-stu`, familyLinkCode: (tag + rid() + "00").slice(0, 18) } });
    const par = await tx.user.create({ data: { name: `${tag}-par`, role: "parent", email: `${tag}-p@x.io`, status: "active" } });
    await tx.parentProfile.create({ data: { userId: par.id } });
    return { student: stu.id, parent: par.id };
  });

  console.log("\n[1] five concurrent student-wallet debits record five DISTINCT running balances");
  await withPlatformContext((tx) => walletCredit(tx, fx.student, 10000, { type: "topup", reason: "l01" }));
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () => withPlatformContext((tx) => walletDebit(tx, fx.student, 1000, { type: "payment", reason: "l01 race" }))),
  );
  assert(results.every((r) => r.status === "fulfilled"), "all five debits succeed (balance covered them)");
  const rows = await withPlatformContext((tx) => tx.walletLedger.findMany({ where: { studentId: fx.student, delta: -1000 }, select: { balanceAfter: true } }));
  const balances = rows.map((r) => r.balanceAfter).sort((a, b) => a - b);
  assert(balances.length === 5 && new Set(balances).size === 5, `five ledger rows carry five distinct balanceAfter values (${balances.join(",")})`);
  assert(balances.join(",") === "5000,6000,7000,8000,9000", "…and they are exactly the sequence the decrements produced");
  const rec = await withPlatformContext((tx) => reconcileWallet(tx, fx.student));
  assert(rec.ok && rec.cached === 5000, `reconcileWallet: cached ${rec.cached} == Σdelta ${rec.ledgerSum} == last balanceAfter ${rec.lastBalanceAfter}`);

  console.log("\n[2] the floor still holds: a sixth debit past the balance is refused, nothing written");
  let refused: Error | null = null;
  try { await withPlatformContext((tx) => walletDebit(tx, fx.student, 6000, { type: "payment", reason: "l01 over" })); } catch (e) { refused = e as Error; }
  assert(refused !== null && /Insufficient/.test(refused.message), "over-debit refused");
  const count = await withPlatformContext((tx) => tx.walletLedger.count({ where: { studentId: fx.student } }));
  assert(count === 6, `ledger has 1 credit + 5 debits, no row for the refusal (got ${count})`);

  console.log("\n[3] the parent wallet has the same shape");
  await withPlatformContext((tx) => parentWalletCredit(tx, fx.parent, 3000, { type: "topup", reason: "l01" }));
  const pres = await Promise.allSettled(
    Array.from({ length: 3 }, () => withPlatformContext((tx) => parentWalletDebit(tx, fx.parent, 1000, { type: "payment", beneficiaryStudentId: fx.student, reason: "l01 race" }))),
  );
  assert(pres.every((r) => r.status === "fulfilled"), "three parent debits succeed");
  const prow = await withPlatformContext((tx) => tx.parentWalletLedger.findMany({ where: { parentId: fx.parent, delta: -1000 }, select: { balanceAfter: true } }));
  assert(prow.map((r) => r.balanceAfter).sort((a, b) => a - b).join(",") === "0,1000,2000", "three distinct running balances 2000,1000,0");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}
async function runGuarded() {
  await assertDbEnv(["test"], { intent: "suite l01-wallet-balance-after.test.ts" });
  try { await main(); } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (__sweepTag) await sweepTagQuietly(__sweepTag); }
  process.exit(process.exitCode ?? 0);
}
runGuarded().catch((e) => { console.error(e); process.exit(1); });
