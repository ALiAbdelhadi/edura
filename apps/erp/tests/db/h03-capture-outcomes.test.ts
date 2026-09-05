// H-03 (SECURITY_AUDIT.md) — a gateway capture ALWAYS ends in a money row.
// Companion to the verbatim PoC (poc-h03-orphaned-capture.test.ts). Pins the
// four outcomes of Phase 3 §3.3.3 and the sweep rule:
//   [1] cancelled subscription, course still open → capture RE-ACTIVATES it;
//   [2] two checkouts for one plan, both captured → first activates, second is
//       CREDITED to the student wallet (no P2002, no lost capture) [M-02 settle side];
//   [3] parent-paid capture whose subscription expired → PARENT wallet credited;
//   [4] intent already `expired` by cron, provider captures late → settles,
//       result `paid_late`, audit `payment.captured_after_expiry`;
//   [5] a FAILURE webhook on an expired intent changes nothing (`not_pending`);
//   [6] the stale-pending sweep skips a subscription whose intent is still
//       payable and cancels the ones whose intent is absent or expired.
// Runs with PAYMENTS_MODE=mock.
import { withPlatformContext } from "@repo/database";
import {
  createSubscriptionCheckout,
  cancelPendingSubscription,
  expireSubscriptions,
} from "@repo/server-core/services/subscriptions/subscriptions";
import { initiateSubscriptionIntent, processWebhookEvent } from "@/lib/services/payments/payment-intents";
import { signMockWebhook, resolveDriver } from "@/lib/services/payments/gateway";
import type { SessionUser } from "@repo/server-core/auth/types";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "h03-capture-outcomes.test.ts";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function webhook(gatewayOrderId: string, success: boolean, tag: string) {
  const rawBody = JSON.stringify({ gateway_order_id: gatewayOrderId, success, gateway_ref: `h03_${tag}_${rid()}`, reason: success ? undefined : "declined", amount_cents: 40000, currency: "EGP" });
  const v = resolveDriver().verifyWebhook(rawBody, { hmac: signMockWebhook(rawBody) });
  if (!v.valid) throw new Error("mock signature failed: " + v.error);
  return processWebhookEvent(v.event, JSON.parse(rawBody)) as Promise<{ handled: boolean; result?: string }>;
}
const intentRow = (id: string) => withPlatformContext((tx) => tx.paymentIntent.findUniqueOrThrow({ where: { id } }));
const subRow = (id: string) => withPlatformContext((tx) => tx.subscription.findUniqueOrThrow({ where: { id } }));

async function main() {
  const tag = "h03s-" + rid(); __sweepTag = tag;
  const fx = await withPlatformContext(async (tx) => {
    const owner = await tx.user.create({ data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" } });
    const center = await tx.center.create({ data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18), status: "active", ownerUserId: owner.id } });
    const teacher = await tx.user.create({ data: { name: `${tag}-t`, role: "teacher", email: `${tag}-t@x.io`, status: "active" } });
    const mkCourse = async (k: string) => tx.course.create({ data: { centerId: center.id, teacherId: teacher.id, title: `${tag}-${k}`, subject: "Math", daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date(), maxStudents: 30, status: "active", price: 40000, pricePerMonth: 40000 } });
    const c1 = await mkCourse("c1"); const c2 = await mkCourse("c2"); const c3 = await mkCourse("c3"); const c4 = await mkCourse("c4"); const c5 = await mkCourse("c5");
    const stu = await tx.user.create({ data: { name: `${tag}-stu`, role: "student", email: `${tag}-s@x.io`, status: "active" } });
    await tx.studentProfile.create({ data: { userId: stu.id, fullName: `${tag}-stu`, familyLinkCode: (tag + rid() + "00").slice(0, 18) } });
    const parent = await tx.user.create({ data: { name: `${tag}-par`, role: "parent", email: `${tag}-p@x.io`, status: "active" } });
    await tx.parentProfile.create({ data: { userId: parent.id } });
    await tx.parentStudentLink.create({ data: { parentId: parent.id, studentId: stu.id, status: "approved", initiatedBy: "parent" } });
    return { center: center.id, courses: [c1.id, c2.id, c3.id, c4.id, c5.id], student: stu.id, parent: parent.id };
  });
  const student = { id: fx.student, role: "student" } as unknown as SessionUser;
  const parent = { id: fx.parent, role: "parent" } as unknown as SessionUser;
  const checkout = (courseId: string, who: SessionUser, extra: Record<string, unknown> = {}) =>
    createSubscriptionCheckout({ courseId, plan: "monthly", method: "card", payFrom: "gateway", idempotencyKey: `${tag}-${rid()}-${rid()}`, ...extra } as never, who, initiateSubscriptionIntent) as Promise<{ id: string }>;

  console.log("\n[1] cancelled subscription, open course → capture re-activates it");
  const i1 = await checkout(fx.courses[0]!, student);
  const r1 = await intentRow(i1.id);
  await cancelPendingSubscription(r1.subscriptionId!, student);
  assert((await subRow(r1.subscriptionId!)).status === "cancelled", "the payer cancelled before the capture arrived");
  const w1 = await webhook(r1.gatewayOrderId!, true, tag);
  const s1 = await subRow(r1.subscriptionId!);
  const a1 = await intentRow(i1.id);
  assert(w1.result === "paid" && a1.status === "paid" && !!a1.paymentId, `intent paid AND linked to a payment row (result=${w1.result}, paymentId=${a1.paymentId})`);
  assert(s1.status === "active" && s1.cancelledAt === null && s1.paymentId === a1.paymentId, "the subscription is active again, its cancellation cleared, coverage paid for");
  const audit1 = await withPlatformContext((tx) => tx.auditLog.count({ where: { action: "subscription.reactivated_by_capture", targetId: s1.id } }));
  assert(audit1 === 1, "an audit row records the re-activation");

  console.log("\n[2] abandoned checkout A expires, checkout B starts and pays, then A is captured late → A CREDITED");
  // M-02 now refuses a second live checkout, so two intents for one plan can
  // only coexist this way: the first is abandoned past its window (H-03 rule
  // 1 still honours a late capture of it), the student starts over and pays.
  const ia = await checkout(fx.courses[1]!, student);
  const ra = await intentRow(ia.id);
  await withPlatformContext((tx) => tx.paymentIntent.update({ where: { id: ia.id }, data: { status: "expired", expiresAt: new Date(Date.now() - 60_000) } }));
  const ib = await checkout(fx.courses[1]!, student);
  const rb = await intentRow(ib.id);
  const wb = await webhook(rb.gatewayOrderId!, true, tag);
  const wa = await webhook(ra.gatewayOrderId!, true, tag);
  const [sa, sb, aa] = [await subRow(ra.subscriptionId!), await subRow(rb.subscriptionId!), await intentRow(ia.id)];
  assert(wb.result === "paid" && sb.status === "active", "the fresh checkout's capture activates its subscription");
  assert(wa.result === "paid_late" && aa.status === "paid" && !!aa.paymentId, `the late capture of the abandoned one settles without throwing (result=${wa.result})`);
  assert(sa.status === "pending_payment", "…but grants no second coverage — the abandoned subscription stays unactivated");
  const wallet2 = await withPlatformContext((tx) => tx.studentProfile.findUniqueOrThrow({ where: { userId: fx.student }, select: { walletBalance: true } }));
  const credit2 = await withPlatformContext((tx) => tx.walletLedger.findFirst({ where: { studentId: fx.student, paymentIntentId: ia.id } }));
  assert(wallet2.walletBalance === 40000 && credit2?.type === "adjustment" && credit2.paymentId === aa.paymentId, `the 400 EGP went to the student wallet as an adjustment linked to the receipt (balance=${wallet2.walletBalance})`);
  const audit2 = await withPlatformContext((tx) => tx.auditLog.count({ where: { action: "payment.orphan_capture_credited", targetId: ia.id } }));
  assert(audit2 === 1, "an audit row records the orphaned capture");
  const payments2 = await withPlatformContext((tx) => tx.payment.count({ where: { studentId: fx.student, courseId: fx.courses[1]! } }));
  assert(payments2 === 2, `both captures have a payments row (got ${payments2})`);

  console.log("\n[3] a PARENT paid; the subscription expired before the capture → parent wallet credited");
  const i3 = await checkout(fx.courses[2]!, parent, { studentId: fx.student });
  const r3 = await intentRow(i3.id);
  await withPlatformContext((tx) => tx.subscription.update({ where: { id: r3.subscriptionId! }, data: { status: "expired" } }));
  const w3 = await webhook(r3.gatewayOrderId!, true, tag);
  const a3 = await intentRow(i3.id);
  const parentWallet = await withPlatformContext((tx) => tx.parentProfile.findUniqueOrThrow({ where: { userId: fx.parent }, select: { walletBalance: true } }));
  const parentRow = await withPlatformContext((tx) => tx.parentWalletLedger.findFirst({ where: { parentId: fx.parent, paymentIntentId: i3.id } }));
  assert(w3.result === "paid" && a3.status === "paid" && !!a3.paymentId, "the capture settles");
  assert(parentWallet.walletBalance === 40000 && parentRow?.beneficiaryStudentId === fx.student, `the PARENT'S wallet holds the 400 EGP, tagged with the child (balance=${parentWallet.walletBalance})`);
  const studentWalletAfter3 = await withPlatformContext((tx) => tx.studentProfile.findUniqueOrThrow({ where: { userId: fx.student }, select: { walletBalance: true } }));
  assert(studentWalletAfter3.walletBalance === 40000, "…and the student's wallet is unchanged from [2]");

  console.log("\n[4] the cron expired the intent; the provider captures late → paid_late");
  const i4 = await checkout(fx.courses[3]!, student);
  const r4 = await intentRow(i4.id);
  await withPlatformContext((tx) => tx.paymentIntent.update({ where: { id: i4.id }, data: { status: "expired", expiresAt: new Date(Date.now() - 60_000) } }));
  const w4 = await webhook(r4.gatewayOrderId!, true, tag);
  const a4 = await intentRow(i4.id); const s4 = await subRow(r4.subscriptionId!);
  assert(w4.result === "paid_late" && a4.status === "paid" && !!a4.paymentId, `late capture settles as paid_late (result=${w4.result})`);
  assert(s4.status === "active", "the subscription is active — the customer got what they paid for");
  const audit4 = await withPlatformContext((tx) => tx.auditLog.count({ where: { action: "payment.captured_after_expiry", targetId: i4.id } }));
  assert(audit4 === 1, "an audit row records the late capture for finance");
  const replay4 = await webhook(r4.gatewayOrderId!, true, tag);
  assert(replay4.result === "replay", "a redelivery is still a replay");

  console.log("\n[5] a FAILURE webhook on an expired intent changes nothing");
  const i5 = await checkout(fx.courses[4]!, student);
  const r5 = await intentRow(i5.id);
  await withPlatformContext((tx) => tx.paymentIntent.update({ where: { id: i5.id }, data: { status: "expired" } }));
  const w5 = await webhook(r5.gatewayOrderId!, false, tag);
  assert(w5.result === "not_pending" && (await intentRow(i5.id)).status === "expired", `a decline on an expired intent is not_pending, status stays expired (result=${w5.result})`);

  console.log("\n[6] the stale-pending sweep respects a still-payable intent");
  const old = new Date(Date.now() - 48 * 3600 * 1000);
  // i5's subscription: pending, intent EXPIRED → stale. Make it look 48h old.
  await withPlatformContext((tx) => tx.subscription.update({ where: { id: r5.subscriptionId! }, data: { createdAt: old } }));
  // a pending subscription with a LIVE intent, also 48h old → must survive
  const i6 = await checkout(fx.courses[4]!, student);
  const r6 = await intentRow(i6.id);
  await withPlatformContext((tx) => tx.subscription.update({ where: { id: r6.subscriptionId! }, data: { createdAt: old } }));
  // a pending subscription with NO intent, 48h old → stale
  const orphanSub = await withPlatformContext(async (tx) => {
    const c = await tx.course.findUniqueOrThrow({ where: { id: fx.courses[4]! } });
    return tx.subscription.create({ data: { studentId: fx.student, targetType: "center", teacherId: c.teacherId, centerId: c.centerId, courseId: c.id, plan: "monthly", price: 40000, source: "online", createdAt: old } });
  });
  const swept = await expireSubscriptions(new Date());
  const [s5, s6, s7] = [await subRow(r5.subscriptionId!), await subRow(r6.subscriptionId!), await subRow(orphanSub.id)];
  assert(s6.status === "pending_payment", "48h-old pending subscription with a LIVE intent is left alone");
  assert(s5.status === "cancelled" && s7.status === "cancelled", "…while the ones with an expired or absent intent are cancelled");
  assert(swept.stalePendingCancelled >= 2, `the sweep reports what it cancelled (${swept.stalePendingCancelled})`);

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
