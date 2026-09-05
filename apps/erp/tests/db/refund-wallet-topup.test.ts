// H-01 (SECURITY_AUDIT.md) — refunding a cash wallet top-up must take the
// balance back in the same transaction, or refuse. Companion to the verbatim
// PoC (poc-h01-wallet-topup-refund.test.ts), which only asserts the hole is
// closed; this suite pins the SHAPE of the fix so it cannot quietly regress:
//   [1] a partial refund debits exactly the partial, links the ledger row to
//       the refund receipt, and reverses the centre's cash-collection credit;
//   [2] a wallet spent below the remaining amount REFUSES the refund and
//       leaves every book unchanged (H2 conditional decrement, no negative);
//   [3] the exact remainder still refunds once the wallet can cover it;
//   [4] an ordinary subscription receipt (no wallet involved) is untouched by
//       the gate — no wallet row, no credit move.
import { withPlatformContext } from "@repo/database";
import { topUpWalletCash } from "@repo/server-core/services/wallet/cash-topup";
import { walletDebit } from "@repo/server-core/services/wallet/wallet";
import { refundPayment } from "@repo/server-core/services/payments/refund-payment";
import { createWalkInSubscription } from "@repo/server-core/services/subscriptions/subscriptions";
import type { SessionUser } from "@repo/server-core/auth/types";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "refund-wallet-topup.test.ts";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
async function caught(fn: () => Promise<unknown>) { try { await fn(); return null; } catch (e) { return e as Error; } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function books(studentId: string, centerId: string) {
  return withPlatformContext(async (tx) => ({
    wallet: (await tx.studentProfile.findUniqueOrThrow({ where: { userId: studentId }, select: { walletBalance: true } })).walletBalance,
    walletRows: await tx.walletLedger.count({ where: { studentId } }),
    credit: (await tx.center.findUniqueOrThrow({ where: { id: centerId }, select: { creditBalance: true } })).creditBalance,
    creditRows: await tx.centerWalletLedger.count({ where: { centerId } }),
    refundRows: await tx.payment.count({ where: { studentId, amount: { lt: 0 } } }),
  }));
}

async function main() {
  const tag = "h01s-" + rid(); __sweepTag = tag;
  const fx = await withPlatformContext(async (tx) => {
    const owner = await tx.user.create({ data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" } });
    const center = await tx.center.create({ data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18), status: "active", ownerUserId: owner.id } });
    await tx.centerAdminProfile.create({ data: { userId: owner.id, centerId: center.id } });
    const teacher = await tx.user.create({ data: { name: `${tag}-t`, role: "teacher", email: `${tag}-t@x.io`, status: "active" } });
    const course = await tx.course.create({ data: { centerId: center.id, teacherId: teacher.id, title: `${tag}-c`, subject: "Math", daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date(), maxStudents: 30, status: "active", price: 30000, pricePerMonth: 30000 } });
    const stu = await tx.user.create({ data: { name: `${tag}-stu`, role: "student", email: `${tag}-s@x.io`, status: "active" } });
    await tx.studentProfile.create({ data: { userId: stu.id, fullName: `${tag}-stu`, familyLinkCode: (tag + rid() + "00").slice(0, 18) } });
    await tx.centerStudentRoster.create({ data: { centerId: center.id, studentId: stu.id } });
    return { owner: owner.id, center: center.id, student: stu.id, course: course.id };
  });
  const owner = { id: fx.owner, role: "center_admin", centerId: fx.center } as unknown as SessionUser;

  console.log("\n[1] a partial refund of a 500 EGP top-up debits exactly the partial");
  const topup = await topUpWalletCash({ studentId: fx.student, amount: 50000 }, owner);
  const receipt = await withPlatformContext((tx) => tx.payment.findFirstOrThrow({ where: { receiptNumber: topup.receiptNumber } }));
  const before = await books(fx.student, fx.center);
  assert(before.wallet === 50000 && before.credit === -50000, `wallet 500, centre credit −500 after collection (wallet=${before.wallet}, credit=${before.credit})`);

  const part = await refundPayment({ paymentId: receipt.id, amount: 20000, reason: "h01 partial", refundChannel: "cash_drawer" }, owner);
  const afterPart = await books(fx.student, fx.center);
  assert(part.walletDebited === true, "the refund reports that it debited the wallet");
  assert(afterPart.wallet === 30000, `wallet is 300 after refunding 200 (got ${afterPart.wallet})`);
  const debitRow = await withPlatformContext((tx) => tx.walletLedger.findFirst({ where: { studentId: fx.student, delta: -20000 } }));
  assert(debitRow?.type === "refund" && debitRow.paymentId === part.id && debitRow.balanceAfter === 30000, "the wallet ledger carries a `refund` row of −200 pointing at the refund receipt, balanceAfter 300");
  assert(afterPart.credit === -30000, `the centre's cash-collection liability shrinks by 200 (credit=${afterPart.credit})`);
  const reversal = await withPlatformContext((tx) => tx.centerWalletLedger.findFirst({ where: { centerId: fx.center, type: "refund_reversal" } }));
  assert(reversal?.delta === 20000, "…recorded as a `refund_reversal` credit move of +200");

  console.log("\n[2] the student spends 250; refunding the remaining 300 is REFUSED, books unchanged");
  await withPlatformContext((tx) => walletDebit(tx, fx.student, 25000, { type: "payment", reason: "h01 spend" }));
  const spent = await books(fx.student, fx.center);
  assert(spent.wallet === 5000, `wallet is 50 after spending 250 (got ${spent.wallet})`);
  const refused = await caught(() => refundPayment({ paymentId: receipt.id, amount: 30000, reason: "h01 too much", refundChannel: "cash_drawer" }, owner));
  assert(refused !== null && /no longer holds/.test(refused.message), `refund of 300 against a 50 wallet is refused (${refused?.message.slice(0, 70)})`);
  const unchanged = await books(fx.student, fx.center);
  const receiptAfter = await withPlatformContext((tx) => tx.payment.findUniqueOrThrow({ where: { id: receipt.id }, select: { refundedTotal: true } }));
  assert(
    unchanged.wallet === spent.wallet && unchanged.walletRows === spent.walletRows && unchanged.credit === spent.credit && unchanged.creditRows === spent.creditRows && unchanged.refundRows === spent.refundRows && receiptAfter.refundedTotal === 20000,
    "the refusal rolled back everything — no refund row, no ledger row, refunded_total still 200",
  );

  console.log("\n[3] what the wallet CAN cover still refunds");
  const small = await refundPayment({ paymentId: receipt.id, amount: 5000, reason: "h01 remainder", refundChannel: "cash_drawer" }, owner);
  const afterSmall = await books(fx.student, fx.center);
  assert(small.walletDebited && afterSmall.wallet === 0, `wallet is 0 after refunding the last 50 (got ${afterSmall.wallet})`);
  assert(small.isFullRefund === false, "250 of 500 remains spent, so the receipt is not fully refunded");

  console.log("\n[4] an ordinary subscription receipt is untouched by the gate");
  const sub = await createWalkInSubscription({ studentId: fx.student, courseId: fx.course, plan: "monthly", paymentMethod: "cash" }, owner);
  const subReceipt = await withPlatformContext((tx) => tx.payment.findFirstOrThrow({ where: { receiptNumber: sub.receiptNumber } }));
  const walletBefore = await books(fx.student, fx.center);
  const subRefund = await refundPayment({ paymentId: subReceipt.id, amount: 30000, reason: "h01 sub", refundChannel: "cash_drawer" }, owner);
  const walletAfter = await books(fx.student, fx.center);
  assert(subRefund.walletDebited === false && subRefund.isFullRefund === true, "a coverage refund reports no wallet leg and cancels coverage as before");
  assert(walletAfter.wallet === walletBefore.wallet && walletAfter.walletRows === walletBefore.walletRows && walletAfter.creditRows === walletBefore.creditRows, "no wallet row and no credit move were written for a non-top-up receipt");

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
