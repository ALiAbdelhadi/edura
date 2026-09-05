// PoC for SECURITY_AUDIT.md H-01 — refunding a cash wallet top-up returns cash
// while the wallet keeps the credit. NOT RUN by the audit. Shape mirrors
// apps/erp/tests/db/refund-bound.test.ts so it can be dropped into tests/db.
//
// Expected TODAY (vulnerable): both asserts in [3] FAIL — the refund succeeds
// and walletBalance is still 50000 after 500 EGP cash was handed back.
// Expected AFTER the fix: refundPayment throws, or walletBalance becomes 0.
import { withPlatformContext } from "@repo/database";
import { topUpWalletCash } from "@repo/server-core/services/wallet/cash-topup";
import { refundPayment } from "@repo/server-core/services/payments/refund-payment";
import type { SessionUser } from "@repo/server-core/auth/types";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "poc-h01-wallet-topup-refund.test.ts";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
async function caught(fn: () => Promise<unknown>) { try { await fn(); return null; } catch (e) { return e; } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function main() {
  const tag = "h01-" + rid(); __sweepTag = tag;
  const fx = await withPlatformContext(async (tx) => {
    const owner = await tx.user.create({ data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" } });
    const center = await tx.center.create({ data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18), status: "active", ownerUserId: owner.id } });
    await tx.centerAdminProfile.create({ data: { userId: owner.id, centerId: center.id } });
    const stu = await tx.user.create({ data: { name: `${tag}-stu`, role: "student", email: `${tag}-s@x.io`, status: "active" } });
    await tx.studentProfile.create({ data: { userId: stu.id, fullName: `${tag}-stu`, familyLinkCode: `${tag.toUpperCase()}F0` } });
    await tx.centerStudentRoster.create({ data: { centerId: center.id, studentId: stu.id } });
    return { owner: owner.id, center: center.id, student: stu.id };
  });
  const owner = { id: fx.owner, role: "center_admin", centerId: fx.center } as unknown as SessionUser;

  console.log("\n[1] counter takes 500 EGP cash and credits the wallet");
  const topup = await topUpWalletCash({ studentId: fx.student, amount: 50000 }, owner);
  assert(topup.balanceAfter === 50000, "wallet balance is 500 EGP");
  const receipt = await withPlatformContext((tx) => tx.payment.findFirstOrThrow({ where: { receiptNumber: topup.receiptNumber } }));

  console.log("\n[2] the same counter 'refunds' the top-up receipt through the ordinary refund door");
  const err = await caught(() => refundPayment({ paymentId: receipt.id, amount: 50000, reason: "poc", refundChannel: "cash_drawer" }, owner));

  console.log("\n[3] what the books say afterwards");
  const wallet = await withPlatformContext((tx) => tx.studentProfile.findUniqueOrThrow({ where: { userId: fx.student }, select: { walletBalance: true } }));
  const ledgerDebits = await withPlatformContext((tx) => tx.walletLedger.count({ where: { studentId: fx.student, delta: { lt: 0 } } }));
  // Phase 3 correction: the header already states the fix may EITHER refuse OR
  // debit the wallet, but this line demanded a throw. The fix debits (the
  // audit's own recommended branch), so the assertion now matches its message.
  assert(err !== null || ledgerDebits > 0, "refund of a wallet top-up receipt is REFUSED (or debits the wallet)");
  assert(wallet.walletBalance === 0 || err !== null, `wallet is not still spendable after cash left the drawer (balance=${wallet.walletBalance}, wallet debits=${ledgerDebits})`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}
async function runGuarded() {
  await assertDbEnv(["test"], { intent: `suite ${SUITE_NAME}` });
  try { await main(); } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (__sweepTag) await sweepTagQuietly(__sweepTag); }
  process.exit(process.exitCode ?? 0);
}
runGuarded().catch((e) => { console.error(e); process.exit(1); });

