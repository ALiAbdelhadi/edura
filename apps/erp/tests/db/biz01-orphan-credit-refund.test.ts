// BIZ-01 (SECURITY_AUDIT.md 2026-09-11) — an orphaned gateway capture is
// credited to the student's wallet as an `adjustment` (H-03), and its receipt
// carries the centre. The counter refund door (H-01) looked only for a
// `topup` ledger row, so refunding that receipt handed the cash back and left
// the wallet credited — the double-spend H-01 closed, through a side door.
// Pins:
//   [1] the orphan receipt refunds ONLY with the wallet debited in the same tx;
//   [2] once the wallet has been spent below the remainder, the refund is
//       refused and every book is unchanged.
// Runs with PAYMENTS_MODE=mock (same setup as h03-capture-outcomes).
import { withPlatformContext } from "@repo/database";
import { createSubscriptionCheckout } from "@repo/server-core/services/subscriptions/subscriptions";
import { walletDebit } from "@repo/server-core/services/wallet/wallet";
import { refundPayment } from "@repo/server-core/services/payments/refund-payment";
import { initiateSubscriptionIntent, processWebhookEvent } from "@repo/server-core/services/payments/payment-intents";
import { signMockWebhook, resolveDriver } from "@repo/server-core/services/payments/gateway/index";
import type { SessionUser } from "@repo/server-core/auth/types";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "biz01-orphan-credit-refund.test.ts";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
async function caught(fn: () => Promise<unknown>) { try { await fn(); return null; } catch (e) { return e as Error; } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);
const PRICE = 40000;

async function webhook(gatewayOrderId: string, tag: string) {
  const rawBody = JSON.stringify({ gateway_order_id: gatewayOrderId, success: true, gateway_ref: `b01_${tag}_${rid()}`, amount_cents: PRICE, currency: "EGP" });
  const v = resolveDriver().verifyWebhook(rawBody, { hmac: signMockWebhook(rawBody) });
  if (!v.valid) throw new Error("mock signature failed: " + v.error);
  return processWebhookEvent(v.event, JSON.parse(rawBody)) as Promise<{ handled: boolean; result?: string }>;
}
const intentRow = (id: string) => withPlatformContext((tx) => tx.paymentIntent.findUniqueOrThrow({ where: { id } }));

async function books(studentId: string, receiptId: string) {
  return withPlatformContext(async (tx) => ({
    wallet: (await tx.studentProfile.findUniqueOrThrow({ where: { userId: studentId }, select: { walletBalance: true } })).walletBalance,
    walletRows: await tx.walletLedger.count({ where: { studentId } }),
    refundRows: await tx.payment.count({ where: { reversalOfId: receiptId } }),
    refundedTotal: (await tx.payment.findUniqueOrThrow({ where: { id: receiptId }, select: { refundedTotal: true } })).refundedTotal,
  }));
}

async function main() {
  const tag = "b01s-" + rid(); __sweepTag = tag;
  const fx = await withPlatformContext(async (tx) => {
    const owner = await tx.user.create({ data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" } });
    const center = await tx.center.create({ data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18), status: "active", ownerUserId: owner.id } });
    await tx.centerAdminProfile.create({ data: { userId: owner.id, centerId: center.id } });
    const teacher = await tx.user.create({ data: { name: `${tag}-t`, role: "teacher", email: `${tag}-t@x.io`, status: "active" } });
    const course = await tx.course.create({ data: { centerId: center.id, teacherId: teacher.id, title: `${tag}-c`, subject: "Math", daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date(), maxStudents: 30, status: "active", price: PRICE, pricePerMonth: PRICE } });
    const stu = await tx.user.create({ data: { name: `${tag}-stu`, role: "student", email: `${tag}-s@x.io`, status: "active" } });
    await tx.studentProfile.create({ data: { userId: stu.id, fullName: `${tag}-stu`, familyLinkCode: (tag + rid() + "00").slice(0, 18) } });
    await tx.centerStudentRoster.create({ data: { centerId: center.id, studentId: stu.id } });
    return { owner: owner.id, center: center.id, course: course.id, student: stu.id };
  });
  const owner = { id: fx.owner, role: "center_admin", centerId: fx.center, locale: "en" } as SessionUser;
  const student = { id: fx.student, role: "student" } as unknown as SessionUser;
  const checkout = () =>
    createSubscriptionCheckout({ courseId: fx.course, plan: "monthly", method: "card", payFrom: "gateway", idempotencyKey: `${tag}-${rid()}-${rid()}` } as never, student, initiateSubscriptionIntent) as Promise<{ id: string }>;

  console.log("\n[setup] checkout A abandoned past its window, checkout B pays, then A is captured late → A credited to the wallet");
  const ia = await checkout();
  const ra = await intentRow(ia.id);
  await withPlatformContext((tx) => tx.paymentIntent.update({ where: { id: ia.id }, data: { status: "expired", expiresAt: new Date(Date.now() - 60_000) } }));
  const ib = await checkout();
  const rb = await intentRow(ib.id);
  const wb = await webhook(rb.gatewayOrderId!, tag);
  const wa = await webhook(ra.gatewayOrderId!, tag);
  const aa = await intentRow(ia.id);
  assert(wb.result === "paid" && wa.result === "paid_late" && !!aa.paymentId, `B activates, A settles as an orphan (${wb.result}/${wa.result})`);
  const receipt = await withPlatformContext((tx) => tx.payment.findUniqueOrThrow({ where: { id: aa.paymentId! } }));
  const credit = await withPlatformContext((tx) => tx.walletLedger.findFirst({ where: { studentId: fx.student, paymentIntentId: ia.id } }));
  assert(receipt.centerId === fx.center && credit?.type === "adjustment" && credit.paymentId === receipt.id, "the orphan receipt names the centre and its wallet credit is an `adjustment` linked to it — the exact shape the old gate missed");
  const start = await books(fx.student, receipt.id);
  assert(start.wallet === PRICE, `the wallet holds the 400 EGP (got ${start.wallet})`);

  console.log("\n[1] a partial refund of the orphan receipt debits the wallet in the same transaction");
  const part = await refundPayment({ paymentId: receipt.id, amount: 10000, reason: "biz01 partial", refundChannel: "cash_drawer" }, owner);
  const afterPart = await books(fx.student, receipt.id);
  assert(part.walletDebited === true, "the refund reports that it debited the wallet");
  assert(afterPart.wallet === PRICE - 10000, `wallet is 300 after refunding 100 (got ${afterPart.wallet})`);
  const debitRow = await withPlatformContext((tx) => tx.walletLedger.findFirst({ where: { studentId: fx.student, delta: -10000 } }));
  assert(debitRow?.type === "refund" && debitRow.paymentId === part.id, "the wallet ledger carries a `refund` row of −100 pointing at the refund receipt");

  console.log("\n[2] the student spends 250; refunding the remaining 300 is REFUSED, books unchanged");
  await withPlatformContext((tx) => walletDebit(tx, fx.student, 25000, { type: "payment", reason: "biz01 spend" }));
  const spent = await books(fx.student, receipt.id);
  assert(spent.wallet === 5000, `wallet is 50 after spending 250 (got ${spent.wallet})`);
  const refused = await caught(() => refundPayment({ paymentId: receipt.id, amount: 30000, reason: "biz01 too much", refundChannel: "cash_drawer" }, owner));
  assert(refused !== null && /no longer holds/.test(refused.message), `refund of 300 against a 50 wallet is refused (${refused?.message.slice(0, 70)})`);
  const unchanged = await books(fx.student, receipt.id);
  assert(
    unchanged.wallet === spent.wallet && unchanged.walletRows === spent.walletRows && unchanged.refundRows === spent.refundRows && unchanged.refundedTotal === 10000,
    "the refusal rolled back everything — no refund row, no ledger row, refunded_total still 100",
  );

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
