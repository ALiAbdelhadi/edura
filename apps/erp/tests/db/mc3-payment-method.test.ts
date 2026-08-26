/**
 * MC-3 — `payments.payment_method` (API session 2, item B.1#3).
 *
 * The gap: the receipt never said how the money arrived — the method was
 * written to the sibling Transaction and to Subscription but never to
 * `payments` — so the centre could not reconcile the cash drawer at all
 * (CENTER_IA_AUDIT §7.2 #8; the takings card ships deliberately unsplit with
 * the guard in apps/erp/src/features/admin/takings.ts pointing at this fix).
 *
 * What is proven here, against the REAL writers (not copies):
 *   1. The cash desk (`recordPayment`) writes `cash`.
 *   2. The counter's cash wallet top-up (`topUpWalletCash`) writes `cash`.
 *   3. The one-step walk-in subscription writes `cash`.
 *   4. The online wallet top-up settler writes `online_paymob`.
 *   5. A row created WITHOUT a method — any future forgotten writer — reads
 *      `unknown`, never a guessed `cash`. (This is also the backfill shape:
 *      migration 20260821120100 defaulted every pre-existing row to it.)
 *   6. `listPayments` hands the method to the fees screen (full-row spread).
 *
 * Run (all suites, guarded):  bun run --filter edura test:db
 * Run (this one only):        bun run --filter edura test:db:only mc3-payment-method
 * NEVER --env-file=.env.local: that is the DEV database and it skips the guard.
 */
import { withPlatformContext } from "@repo/database";
import { recordPayment, listPayments } from "@repo/server-core/services/payments/payments";
import { topUpWalletCash } from "@repo/server-core/services/wallet/cash-topup";
import { createWalkInSubscription } from "@repo/server-core/services/subscriptions/subscriptions";
import { settleWalletTopUpFromIntentTx } from "@/lib/services/wallet/wallet";
import type { SessionUser } from "@/lib/auth/session";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "mc3-payment-method.test.ts";

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

async function methodOf(paymentId: string): Promise<string> {
  const row = await withPlatformContext((tx) =>
    tx.payment.findUnique({ where: { id: paymentId }, select: { paymentMethod: true } }),
  );
  return row?.paymentMethod ?? "<missing>";
}

async function main() {
  const tag = "mc3-" + rid();
  __sweepTag = tag;
  console.log("MC-3 payment_method DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const center = await tx.center.create({
      data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18) },
    });
    const admin = await tx.user.create({
      data: { name: `${tag}-admin`, role: "center_admin", email: `${tag}-a@x.io`, status: "active" },
    });
    // The user row carries no center link — ownership lives on the center, and
    // `centerId` reaches services via the SESSION user (below).
    await tx.center.update({ where: { id: center.id }, data: { ownerUserId: admin.id } });
    const teacher = await tx.user.create({
      data: { name: `${tag}-teacher`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
    const student = await tx.user.create({
      data: { name: `${tag}-student`, role: "student", email: `${tag}-s@x.io`, status: "active" },
    });
    // walletCredit updates the student's profile row, so the fixture needs one.
    await tx.studentProfile.create({
      data: {
        userId: student.id, fullName: `${tag}-student`, phone: `+2010${tag.replace(/\D/g, "").padEnd(8, "7").slice(0, 8)}`,
        familyLinkCode: (tag + "fam").slice(0, 18), entityType: "registered", pointsBalance: 0,
      },
    });
    await tx.centerStudentRoster.create({ data: { centerId: center.id, studentId: student.id } });
    const course = await tx.course.create({
      data: {
        centerId: center.id, teacherId: teacher.id, title: `${tag}-c`, subject: "Math",
        daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date("2026-01-01T00:00:00Z"),
        maxStudents: 30, status: "active", price: 30000, pricePerMonth: 30000,
      },
    });
    return { center: center.id, admin, student: student.id, course: course.id };
  });

  const adminUser: SessionUser = {
    id: fx.admin.id, role: "center_admin", centerId: fx.center,
  } as SessionUser;

  console.log("\n[1] the cash desk writes `cash`");
  const cashPayment = await recordPayment({ studentId: fx.student, amount: 5000, note: `${tag} cash` }, adminUser);
  assert((await methodOf(cashPayment.id)) === "cash", "recordPayment → paymentMethod cash");

  console.log("\n[2] cash wallet top-up writes `cash`");
  const topup = await topUpWalletCash({ studentId: fx.student, amount: 2000 }, adminUser);
  const topupMethod = await withPlatformContext(async (tx) => {
    const row = await tx.payment.findUnique({ where: { receiptNumber: topup.receiptNumber }, select: { paymentMethod: true } });
    return row?.paymentMethod;
  });
  assert(topupMethod === "cash", "topUpWalletCash → paymentMethod cash");

  console.log("\n[3] walk-in subscription (counter cash) writes `cash`");
  const walkIn = await createWalkInSubscription(
    { studentId: fx.student, courseId: fx.course, plan: "monthly" },
    adminUser,
  );
  const walkInMethod = await withPlatformContext(async (tx) => {
    const sub = await tx.subscription.findUnique({ where: { id: walkIn.id }, select: { paymentId: true } });
    if (!sub?.paymentId) return "<no payment>";
    const row = await tx.payment.findUnique({ where: { id: sub.paymentId }, select: { paymentMethod: true } });
    return row?.paymentMethod;
  });
  assert(walkInMethod === "cash", "createWalkInSubscription → paymentMethod cash");

  console.log("\n[4] the online top-up settler writes `online_paymob`");
  const onlineMethod = await withPlatformContext(async (tx) => {
    const intent = await tx.paymentIntent.create({
      data: {
        studentId: fx.student, purpose: "wallet_topup", amount: 1500, method: "card", gateway: "mock",
        idempotencyKey: `${tag}-idem`, status: "paid", paidAt: new Date(),
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await settleWalletTopUpFromIntentTx(tx, intent.id, { gatewayRef: `${tag}-ref` });
    const settled = await tx.paymentIntent.findUnique({ where: { id: intent.id }, select: { paymentId: true } });
    if (!settled?.paymentId) return "<no payment>";
    const row = await tx.payment.findUnique({ where: { id: settled.paymentId }, select: { paymentMethod: true } });
    return row?.paymentMethod;
  });
  assert(onlineMethod === "online_paymob", "settleWalletTopUpFromIntentTx → paymentMethod online_paymob");

  console.log("\n[5] a writer that forgets the method produces `unknown` — never a guessed cash");
  const bare = await withPlatformContext((tx) =>
    tx.payment.create({
      data: {
        centerId: fx.center, studentId: fx.student, amount: 100,
        note: `${tag} bare`, receiptNumber: `RCP-${tag}-BARE`, recordedBy: fx.admin.id,
      },
      select: { id: true, paymentMethod: true },
    }),
  );
  assert(bare.paymentMethod === "unknown", "no method on create → unknown (the backfill/default honesty rule)");

  console.log("\n[6] listPayments hands the method to the fees screen");
  const listed = await listPayments({}, adminUser);
  const byId = new Map(listed.map((p: { id: string; paymentMethod?: string }) => [p.id, p.paymentMethod]));
  assert(byId.get(cashPayment.id) === "cash", "the cash receipt lists as cash");
  assert(byId.get(bare.id) === "unknown", "the bare receipt lists as unknown — its own bucket, not folded into cash");

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
