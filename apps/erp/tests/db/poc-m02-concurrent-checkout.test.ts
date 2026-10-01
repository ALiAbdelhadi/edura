// PoC for SECURITY_AUDIT.md M-02 — two concurrent gateway checkouts for the same
// course/plan both produce intents; the student pays both; the second capture
// is either a duplicate active subscription (what Phase 2 described) or — since
// `subs_one_active_monthly` already exists (Phase 3 §3.2/1) — a P2002 inside the
// webhook transaction that rolls the claim back and leaves the second capture
// with NO row at all. Either outcome is wrong. Written in Phase 3 from the
// Appendix A-5 recipe. Runs with PAYMENTS_MODE=mock. NOT RUN by the audit.
//
// Expected TODAY (vulnerable): [2] both checkouts succeed with distinct intents;
// [3] second settlement either throws or books nothing; assert in [4] FAILS.
// Expected AFTER the fix: the second checkout is refused ("checkout in
// progress") OR its capture is credited to the payer's wallet — never lost.
import { withPlatformContext } from "@repo/database";
import { createSubscriptionCheckout } from "@repo/server-core/services/subscriptions/subscriptions";
import { initiateSubscriptionIntent, processWebhookEvent } from "@repo/server-core/services/payments/payment-intents";
import { signMockWebhook, resolveDriver } from "@repo/server-core/services/payments/gateway/index";
import type { SessionUser } from "@repo/server-core/auth/types";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "poc-m02-concurrent-checkout.test.ts";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function settleByWebhook(gatewayOrderId: string, tag: string, amount: number) {
  const rawBody = JSON.stringify({ gateway_order_id: gatewayOrderId, success: true, gateway_ref: `poc_${tag}_${rid()}`, amount_cents: amount, currency: "EGP" });
  const v = resolveDriver().verifyWebhook(rawBody, { hmac: signMockWebhook(rawBody) });
  if (!v.valid) throw new Error("mock signature failed: " + v.error);
  try { return { ok: true as const, outcome: await processWebhookEvent(v.event, JSON.parse(rawBody)) }; }
  catch (e) { return { ok: false as const, error: (e as Error).message }; }
}

async function main() {
  const tag = "m02-" + rid(); __sweepTag = tag;
  const fx = await withPlatformContext(async (tx) => {
    const owner = await tx.user.create({ data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" } });
    const center = await tx.center.create({ data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18), status: "active", ownerUserId: owner.id } });
    const teacher = await tx.user.create({ data: { name: `${tag}-t`, role: "teacher", email: `${tag}-t@x.io`, status: "active" } });
    const course = await tx.course.create({ data: { centerId: center.id, teacherId: teacher.id, title: `${tag}-c`, subject: "Math", daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date(), maxStudents: 30, status: "active", price: 40000, pricePerMonth: 40000 } });
    const stu = await tx.user.create({ data: { name: `${tag}-stu`, role: "student", email: `${tag}-s@x.io`, status: "active" } });
    await tx.studentProfile.create({ data: { userId: stu.id, fullName: `${tag}-stu`, familyLinkCode: (tag + rid() + "00").slice(0, 18) } });
    return { course: course.id, student: stu.id };
  });
  const student = { id: fx.student, role: "student" } as unknown as SessionUser;
  const checkout = (k: number) =>
    createSubscriptionCheckout({ courseId: fx.course, plan: "monthly", method: "card", payFrom: "gateway", idempotencyKey: `${tag}-race-${k}-${rid()}` }, student, initiateSubscriptionIntent)
      .then((r) => ({ ok: true as const, intent: r as { id: string } }))
      .catch((e) => ({ ok: false as const, error: (e as Error).message }));

  console.log("\n[1] two checkouts for the same course/plan, in parallel");
  const [a, b] = await Promise.all([checkout(1), checkout(2)]);
  console.log("   a:", a.ok ? a.intent.id : a.error, " b:", b.ok ? b.intent.id : b.error);
  const winners = [a, b].filter((r) => r.ok) as { ok: true; intent: { id: string } }[];

  console.log("\n[2] every intent that was issued gets paid (mock capture)");
  const rows = await withPlatformContext((tx) => tx.paymentIntent.findMany({ where: { id: { in: winners.map((w) => w.intent.id) } } }));
  const settled = [];
  for (const r of rows) settled.push(await settleByWebhook(r.gatewayOrderId!, tag, r.amount));
  console.log("   settlements:", JSON.stringify(settled));

  console.log("\n[3] what the books say afterwards");
  const after = await withPlatformContext(async (tx) => ({
    activeSubs: await tx.subscription.count({ where: { studentId: fx.student, courseId: fx.course, status: "active" } }),
    payments: await tx.payment.count({ where: { studentId: fx.student, amount: { gt: 0 } } }),
    paidIntents: await tx.paymentIntent.count({ where: { id: { in: rows.map((r) => r.id) }, status: "paid" } }),
    walletBalance: (await tx.studentProfile.findUniqueOrThrow({ where: { userId: fx.student }, select: { walletBalance: true } })).walletBalance,
  }));
  console.log("   ", JSON.stringify(after));

  console.log("\n[4] invariants");
  assert(after.activeSubs <= 1, `at most one active monthly subscription (got ${after.activeSubs})`);
  const captures = settled.filter((s) => s.ok).length + settled.filter((s) => !s.ok).length; // every attempted capture is money the provider took
  const recorded = after.payments; // every capture must leave a payments row (subscription OR wallet credit)
  assert(winners.length <= 1 || recorded === captures, `every capture the provider took is recorded as a payments row (captures=${captures}, recorded=${recorded}, wallet=${after.walletBalance})`);
  assert(settled.every((s) => s.ok), `no webhook settlement throws (a thrown claim is a capture with no row): ${settled.filter((s) => !s.ok).map((s) => (s as { error: string }).error).join("; ") || "none threw"}`);

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
