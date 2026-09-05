// PoC for SECURITY_AUDIT.md H-03 — a successful webhook for an intent whose
// subscription was cancelled is marked `paid` and books NOTHING. NOT RUN.
// Runs with PAYMENTS_MODE=mock (default outside production).
//
// Expected TODAY (vulnerable): asserts in [3] FAIL — intent.status === "paid",
// zero payments rows, zero transactions rows, subscription still cancelled.
import { withPlatformContext } from "@repo/database";
import { createSubscriptionCheckout, cancelPendingSubscription } from "@repo/server-core/services/subscriptions/subscriptions";
import { initiateSubscriptionIntent, processWebhookEvent } from "@/lib/services/payments/payment-intents"; // apps/erp alias
import { signMockWebhook, resolveDriver } from "@/lib/services/payments/gateway";
import type { SessionUser } from "@repo/server-core/auth/types";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "poc-h03-orphaned-capture.test.ts";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function main() {
  const tag = "h03-" + rid(); __sweepTag = tag;
  const fx = await withPlatformContext(async (tx) => {
    const owner = await tx.user.create({ data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" } });
    const center = await tx.center.create({ data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18), status: "active", ownerUserId: owner.id } });
    const teacher = await tx.user.create({ data: { name: `${tag}-t`, role: "teacher", email: `${tag}-t@x.io`, status: "active" } });
    const course = await tx.course.create({ data: { centerId: center.id, teacherId: teacher.id, title: `${tag}-c`, subject: "Math", daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date(), maxStudents: 30, status: "active", price: 40000, pricePerMonth: 40000 } });
    const stu = await tx.user.create({ data: { name: `${tag}-stu`, role: "student", email: `${tag}-s@x.io`, status: "active" } });
    await tx.studentProfile.create({ data: { userId: stu.id, fullName: `${tag}-stu`, familyLinkCode: `${tag.toUpperCase()}F0` } });
    return { course: course.id, student: stu.id };
  });
  const student = { id: fx.student, role: "student" } as unknown as SessionUser;

  console.log("\n[1] student starts a card checkout (pending subscription + pending intent)");
  const intent = (await createSubscriptionCheckout({ courseId: fx.course, plan: "monthly", method: "card", payFrom: "gateway", idempotencyKey: `${tag}-key-000001` }, student, initiateSubscriptionIntent)) as { id: string };
  const row = await withPlatformContext((tx) => tx.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } }));
  assert(row.status === "pending" && !!row.subscriptionId && !!row.gatewayOrderId, "intent is pending and linked to a pending subscription");

  console.log("\n[2] student cancels the unpaid subscription in the app (or the 24h sweep does) — then the provider's success webhook arrives");
  await cancelPendingSubscription(row.subscriptionId!, student);
  // Phase 3 (H-04): the mock body now carries the amount and currency the real contract needs.
  const rawBody = JSON.stringify({ gateway_order_id: row.gatewayOrderId, success: true, gateway_ref: `poc_${tag}`, amount_cents: row.amount, currency: row.currency });
  const v = resolveDriver().verifyWebhook(rawBody, { hmac: signMockWebhook(rawBody) });
  if (!v.valid) throw new Error("mock signature failed: " + v.error);
  const outcome = await processWebhookEvent(v.event, JSON.parse(rawBody));

  console.log("\n[3] what the books say afterwards");
  const after = await withPlatformContext(async (tx) => ({
    intent: await tx.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } }),
    payments: await tx.payment.count({ where: { studentId: fx.student } }),
    txns: await tx.transaction.count({ where: { fromEntityId: fx.student } }),
    sub: await tx.subscription.findUniqueOrThrow({ where: { id: row.subscriptionId! } }),
  }));
  console.log("   outcome:", JSON.stringify(outcome), "intent:", after.intent.status, "payments:", after.payments, "txns:", after.txns, "sub:", after.sub.status);
  assert(!(after.intent.status === "paid" && after.payments === 0 && after.txns === 0), "a captured payment is NEVER marked paid with zero payment and zero ledger rows");
  assert(after.sub.status === "active" || after.payments > 0, "the money either activates the subscription or is recorded somewhere the customer can see");

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

