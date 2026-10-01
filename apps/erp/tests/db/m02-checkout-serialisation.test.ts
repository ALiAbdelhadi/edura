// M-02 (SECURITY_AUDIT.md), checkout side, plus L-10. The settle side (a
// second capture is credited, never lost) is pinned by h03-capture-outcomes
// [2] and poc-m02-concurrent-checkout. This pins the checkout door:
//   [1] two PARALLEL checkouts for one plan → exactly one intent, the other
//       refused as "in progress" (FOR UPDATE on the student row serialises);
//   [2] the same idempotency key twice → the same intent, ONE subscription row
//       (L-10: no orphan `pending_payment` per retry);
//   [3] cancelling the pending subscription frees the door;
//   [4] an abandoned intent (expired) frees the door too — it is not a lockout.
import { withPlatformContext } from "@repo/database";
import { createSubscriptionCheckout, cancelPendingSubscription } from "@repo/server-core/services/subscriptions/subscriptions";
import { initiateSubscriptionIntent } from "@repo/server-core/services/payments/payment-intents";
import type { SessionUser } from "@repo/server-core/auth/types";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "m02-checkout-serialisation.test.ts";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function main() {
  const tag = "m02s-" + rid(); __sweepTag = tag;
  const fx = await withPlatformContext(async (tx) => {
    const owner = await tx.user.create({ data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" } });
    const center = await tx.center.create({ data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18), status: "active", ownerUserId: owner.id } });
    const teacher = await tx.user.create({ data: { name: `${tag}-t`, role: "teacher", email: `${tag}-t@x.io`, status: "active" } });
    const c1 = await tx.course.create({ data: { centerId: center.id, teacherId: teacher.id, title: `${tag}-c1`, subject: "Math", daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date(), maxStudents: 30, status: "active", price: 40000, pricePerMonth: 40000 } });
    const c2 = await tx.course.create({ data: { centerId: center.id, teacherId: teacher.id, title: `${tag}-c2`, subject: "Math", daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date(), maxStudents: 30, status: "active", price: 40000, pricePerMonth: 40000 } });
    const stu = await tx.user.create({ data: { name: `${tag}-stu`, role: "student", email: `${tag}-s@x.io`, status: "active" } });
    await tx.studentProfile.create({ data: { userId: stu.id, fullName: `${tag}-stu`, familyLinkCode: (tag + rid() + "00").slice(0, 18) } });
    return { c1: c1.id, c2: c2.id, student: stu.id };
  });
  const student = { id: fx.student, role: "student" } as unknown as SessionUser;
  const checkout = (courseId: string, key = `${tag}-${rid()}-${rid()}`) =>
    createSubscriptionCheckout({ courseId, plan: "monthly", method: "card", payFrom: "gateway", idempotencyKey: key }, student, initiateSubscriptionIntent)
      .then((r) => ({ ok: true as const, intent: r as { id: string } }))
      .catch((e) => ({ ok: false as const, error: (e as Error).message }));
  const subsFor = (courseId: string) => withPlatformContext((tx) => tx.subscription.count({ where: { studentId: fx.student, courseId } }));

  console.log("\n[1] two parallel checkouts for one plan");
  const [a, b] = await Promise.all([checkout(fx.c1), checkout(fx.c1)]);
  const winners = [a, b].filter((r) => r.ok);
  const losers = [a, b].filter((r) => !r.ok) as { ok: false; error: string }[];
  assert(winners.length === 1 && losers.length === 1, `exactly one intent is issued (ok=${winners.length}, refused=${losers.length})`);
  assert(/already in progress/.test(losers[0]?.error ?? ""), `the other is refused as in progress (${losers[0]?.error.slice(0, 70)})`);
  assert((await subsFor(fx.c1)) === 1, "one pending subscription row, not two");

  console.log("\n[2] the same idempotency key twice (L-10)");
  const key = `${tag}-same-${rid()}`;
  const first = await checkout(fx.c2, key);
  const again = await checkout(fx.c2, key);
  assert(first.ok && again.ok && first.intent.id === again.intent.id, "the retry returns the SAME intent");
  assert((await subsFor(fx.c2)) === 1, "…and mints no second subscription row");

  console.log("\n[3] cancelling the pending subscription frees the door");
  const pendingSub = await withPlatformContext((tx) => tx.subscription.findFirstOrThrow({ where: { studentId: fx.student, courseId: fx.c1, status: "pending_payment" } }));
  await cancelPendingSubscription(pendingSub.id, student);
  const after = await checkout(fx.c1);
  assert(after.ok, "a new checkout succeeds once the old one is cancelled");

  console.log("\n[4] an abandoned (expired) intent frees the door too");
  await withPlatformContext((tx) => tx.paymentIntent.updateMany({ where: { subscriptionId: { not: null }, studentId: fx.student, status: "pending" }, data: { expiresAt: new Date(Date.now() - 1000) } }));
  const afterExpiry = await checkout(fx.c1);
  assert(afterExpiry.ok, "a new checkout succeeds once the in-flight intent has expired — not a lockout");

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
