// PoC for SECURITY_AUDIT.md H-04 — a capture whose amount, currency or
// integration does not match the intent must NEVER settle. Written in Phase 3
// (the audit had no DB PoC for H-04: the finding was a missing contract).
//   [1] a signed success for HALF the amount → intent `needs_review`, no
//       payments row, no ledger row, subscription still pending, audit row;
//   [2] the right amount in the wrong currency → same;
//   [3] with PAYMOB_INTEGRATION_IDS set, an unknown integration → same;
//   [4] the exact capture from an allowed integration → paid, one payment row;
//   [5] a `pending` callback books nothing and leaves the intent claimable;
//   [6] a `void` before capture fails the intent; a refund callback with no
//       armed refund is recorded and ignored (M-05 will pair it).
import { withPlatformContext } from "@repo/database";
import { createSubscriptionCheckout } from "@repo/server-core/services/subscriptions/subscriptions";
import { initiateSubscriptionIntent, processWebhookEvent } from "@repo/server-core/services/payments/payment-intents";
import { signMockWebhook, resolveDriver } from "@repo/server-core/services/payments/gateway/index";
import type { SessionUser } from "@repo/server-core/auth/types";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "poc-h04-webhook-amount.test.ts";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function send(body: Record<string, unknown>) {
  const rawBody = JSON.stringify(body);
  const v = resolveDriver().verifyWebhook(rawBody, { hmac: signMockWebhook(rawBody) });
  if (!v.valid) throw new Error("mock signature failed: " + v.error);
  return processWebhookEvent(v.event, JSON.parse(rawBody)) as Promise<{ handled: boolean; result?: string }>;
}
const intentRow = (id: string) => withPlatformContext((tx) => tx.paymentIntent.findUniqueOrThrow({ where: { id } }));
async function books(studentId: string) {
  return withPlatformContext(async (tx) => ({
    payments: await tx.payment.count({ where: { studentId } }),
    txns: await tx.transaction.count({ where: { fromEntityId: studentId } }),
    wallet: (await tx.studentProfile.findUniqueOrThrow({ where: { userId: studentId }, select: { walletBalance: true } })).walletBalance,
  }));
}

async function main() {
  const tag = "h04-" + rid(); __sweepTag = tag;
  const fx = await withPlatformContext(async (tx) => {
    const owner = await tx.user.create({ data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" } });
    const center = await tx.center.create({ data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18), status: "active", ownerUserId: owner.id } });
    const teacher = await tx.user.create({ data: { name: `${tag}-t`, role: "teacher", email: `${tag}-t@x.io`, status: "active" } });
    const courses = [];
    for (const k of ["a", "b", "c", "d", "e", "f"]) {
      courses.push((await tx.course.create({ data: { centerId: center.id, teacherId: teacher.id, title: `${tag}-${k}`, subject: "Math", daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date(), maxStudents: 30, status: "active", price: 40000, pricePerMonth: 40000 } })).id);
    }
    const stu = await tx.user.create({ data: { name: `${tag}-stu`, role: "student", email: `${tag}-s@x.io`, status: "active" } });
    await tx.studentProfile.create({ data: { userId: stu.id, fullName: `${tag}-stu`, familyLinkCode: (tag + rid() + "00").slice(0, 18) } });
    return { courses, student: stu.id };
  });
  const student = { id: fx.student, role: "student" } as unknown as SessionUser;
  const checkout = async (courseId: string) => {
    const i = (await createSubscriptionCheckout({ courseId, plan: "monthly", method: "card", payFrom: "gateway", idempotencyKey: `${tag}-${rid()}-${rid()}` }, student, initiateSubscriptionIntent)) as { id: string };
    return intentRow(i.id);
  };
  const zero = await books(fx.student);

  console.log("\n[1] a signed SUCCESS for half the amount");
  const i1 = await checkout(fx.courses[0]!);
  const r1 = await send({ gateway_order_id: i1.gatewayOrderId, success: true, gateway_ref: `h04_${rid()}`, amount_cents: 20000, currency: "EGP" });
  const a1 = await intentRow(i1.id);
  const b1 = await books(fx.student);
  assert(r1.result === "needs_review" && a1.status === "needs_review", `intent parked as needs_review (result=${r1.result}, status=${a1.status})`);
  assert(/amount_mismatch: got 20000 expected 40000/.test(a1.failureReason ?? ""), `the reason names both figures (${a1.failureReason})`);
  assert(b1.payments === zero.payments && b1.txns === zero.txns && b1.wallet === zero.wallet && a1.paymentId === null, "nothing was booked — no payment, no ledger row, no wallet, no link");
  const sub1 = await withPlatformContext((tx) => tx.subscription.findUniqueOrThrow({ where: { id: i1.subscriptionId! } }));
  assert(sub1.status === "pending_payment", "the subscription was not activated");
  const audit1 = await withPlatformContext((tx) => tx.auditLog.count({ where: { action: "payment.webhook_rejected", targetId: i1.id } }));
  assert(audit1 === 1, "an audit row records the rejected capture");
  const replay1 = await send({ gateway_order_id: i1.gatewayOrderId, success: true, gateway_ref: `h04_${rid()}`, amount_cents: 40000, currency: "EGP" });
  assert(replay1.result === "not_pending" && (await intentRow(i1.id)).status === "needs_review", "a later correct capture does NOT auto-settle a parked intent — a human resolves it");

  console.log("\n[2] the right amount in the wrong currency");
  const i2 = await checkout(fx.courses[1]!);
  const r2 = await send({ gateway_order_id: i2.gatewayOrderId, success: true, gateway_ref: `h04_${rid()}`, amount_cents: 40000, currency: "USD" });
  const a2 = await intentRow(i2.id);
  assert(r2.result === "needs_review" && /currency_mismatch/.test(a2.failureReason ?? "") && (await books(fx.student)).payments === zero.payments, `parked for currency (${a2.failureReason})`);

  console.log("\n[3] an integration this deployment does not own");
  process.env.PAYMOB_INTEGRATION_IDS = "111,222";
  const i3 = await checkout(fx.courses[2]!);
  const r3 = await send({ gateway_order_id: i3.gatewayOrderId, success: true, gateway_ref: `h04_${rid()}`, amount_cents: 40000, currency: "EGP", integration_id: "999" });
  const a3 = await intentRow(i3.id);
  assert(r3.result === "needs_review" && /unknown_integration: 999/.test(a3.failureReason ?? ""), `parked for integration (${a3.failureReason})`);

  console.log("\n[4] the exact capture from an allowed integration settles");
  const i4 = await checkout(fx.courses[3]!);
  const r4 = await send({ gateway_order_id: i4.gatewayOrderId, success: true, gateway_ref: `h04_${rid()}`, amount_cents: 40000, currency: "EGP", integration_id: "222" });
  const a4 = await intentRow(i4.id);
  delete process.env.PAYMOB_INTEGRATION_IDS;
  assert(r4.result === "paid" && a4.status === "paid" && !!a4.paymentId, "paid, with a payment row linked");
  assert((await books(fx.student)).payments === zero.payments + 1, "exactly one payment row across [1]–[4]");

  console.log("\n[5] a `pending` callback books nothing and leaves the intent claimable");
  const i5 = await checkout(fx.courses[4]!);
  const r5 = await send({ gateway_order_id: i5.gatewayOrderId, success: true, pending: true, gateway_ref: `h04_${rid()}`, amount_cents: 40000, currency: "EGP" });
  assert(r5.result === "ignored" && (await intentRow(i5.id)).status === "pending", `pending is ignored (result=${r5.result})`);
  const r5b = await send({ gateway_order_id: i5.gatewayOrderId, success: true, gateway_ref: `h04_${rid()}`, amount_cents: 40000, currency: "EGP" });
  assert(r5b.result === "paid", "…and the real capture that follows settles");

  console.log("\n[6] void before capture fails the intent; an un-armed refund is recorded, not booked");
  const i6 = await checkout(fx.courses[5]!);
  const r6 = await send({ gateway_order_id: i6.gatewayOrderId, success: true, is_voided: true, gateway_ref: `h04_${rid()}`, amount_cents: 40000, currency: "EGP" });
  const a6 = await intentRow(i6.id);
  assert(r6.result === "failed" && a6.status === "failed" && /voided/.test(a6.failureReason ?? ""), `void → failed (${a6.failureReason})`);
  const before6 = await books(fx.student);
  const r6b = await send({ gateway_order_id: i4.gatewayOrderId, success: true, is_refunded: true, parent_transaction: a4.gatewayRef, gateway_ref: `h04_${rid()}`, amount_cents: 40000, currency: "EGP" });
  const after6 = await books(fx.student);
  const audit6 = await withPlatformContext((tx) => tx.auditLog.count({ where: { action: "payment.unsolicited_refund", targetId: i4.id } }));
  assert(r6b.result === "ignored" && audit6 === 1 && after6.payments === before6.payments && after6.wallet === before6.wallet, "refund callback nobody armed: audited, finance told, nothing booked");

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
