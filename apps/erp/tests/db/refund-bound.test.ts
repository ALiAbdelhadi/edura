import { withPlatformContext } from "@repo/database";
import { recordPayment } from "@repo/server-core/services/payments/payments";
import {
  refundPayment,
  confirmRefund,
  listUnconfirmedRefunds,
} from "@repo/server-core/services/payments/refund-payment";
import { openShift, myOpenShift } from "@repo/server-core/services/center/shifts";
import { BusinessRuleError, NotFoundError } from "@repo/server-core/errors/classes";
import type { SessionUser } from "@repo/server-core/auth/types";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "refund-bound.test.ts";

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

async function caught(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}

const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function main() {
  const tag = "rfb-" + rid();
  __sweepTag = tag;
  console.log("Refund bound DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const owner = await tx.user.create({
      data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" },
    });
    const center = await tx.center.create({
      data: {
        name: `${tag}-center`,
        shortId: tag.toUpperCase().slice(0, 18),
        status: "active",
        ownerUserId: owner.id,
      },
    });
    await tx.centerAdminProfile.create({ data: { userId: owner.id, centerId: center.id } });
    const students: string[] = [];
    for (let i = 0; i < 3; i++) {
      const stu = await tx.user.create({
        data: { name: `${tag}-stu${i}`, role: "student", email: `${tag}-s${i}@x.io`, status: "active" },
      });
      students.push(stu.id);
      await tx.studentProfile.create({
        data: { userId: stu.id, fullName: `${tag}-stu${i}`, familyLinkCode: `${tag.toUpperCase()}F${i}` },
      });
      await tx.centerStudentRoster.create({ data: { centerId: center.id, studentId: stu.id } });
    }
    const teacher = await tx.user.create({
      data: { name: `${tag}-teacher`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
    const course = await tx.course.create({
      data: {
        centerId: center.id, teacherId: teacher.id, title: `${tag}-c`, subject: "Math",
        daysOfWeek: [1], startTime: "10:00", endTime: "11:00",
        startDate: new Date(Date.now() - 30 * 86400000),
        maxStudents: 30, status: "active", price: 40000, pricePerSession: 5000,
      },
    });
    const sessions: string[] = [];
    for (let i = 0; i < 3; i++) {
      const sess = await tx.session.create({
        data: {
          courseId: course.id, teacherId: teacher.id,
          originalDate: new Date(Date.now() + i * 86400000),
          date: new Date(Date.now() + i * 86400000),
          startTime: "10:00", endTime: "11:00", status: "scheduled",
        },
      });
      sessions.push(sess.id);
    }
    await tx.enrollment.create({
      data: {
        studentId: students[2], courseId: course.id, centerId: center.id,
        status: "active", enrolledBy: teacher.id,
      },
    });
    return {
      owner: owner.id, center: center.id, students,
      teacher: teacher.id, course: course.id, sessions,
    };
  });

  const owner = { id: fx.owner, role: "center_admin", centerId: fx.center } as unknown as SessionUser;

  console.log("\n[1] a refund has to name the receipt it reverses");
  const charge = await recordPayment({ studentId: fx.students[0], amount: 50000 }, owner);
  assert(charge.amount === 50000, "the student pays 500 EGP cash at the counter");

  const negative = await caught(() =>
    recordPayment({ studentId: fx.students[0], amount: -50000 }, owner),
  );
  assert(
    negative instanceof BusinessRuleError,
    "recordPayment refuses a negative amount outright — the same refusal apps/superadmin always made",
  );

  console.log("\n[2] the receipt has to belong to this centre");
  const missing = await caught(() =>
    refundPayment({ paymentId: fx.center, amount: 1000, reason: "nope", refundChannel: "cash_drawer" }, owner),
  );
  assert(missing instanceof NotFoundError, "an id that names no receipt of this centre is a 404");

  console.log("\n[3] the amount is bounded by the receipt — in the DATABASE");
  const over = await caught(() =>
    refundPayment({ paymentId: charge.id, amount: 60000, reason: "too much", refundChannel: "cash_drawer" }, owner),
  );
  assert(
    over instanceof BusinessRuleError,
    "600 EGP back on a 500 EGP receipt is refused by the conditional refunded_total bump",
  );

  const theOldHole = await caught(() =>
    refundPayment({ paymentId: charge.id, amount: 99_999_900, reason: "the old hole", refundChannel: "cash_drawer" }, owner),
  );
  assert(
    theOldHole instanceof BusinessRuleError,
    "the schema's ceiling of 99,999,900 piasters no longer reaches the ledger",
  );

  const untouched = await withPlatformContext((tx) =>
    tx.payment.findUnique({ where: { id: charge.id }, select: { refundedTotal: true } }),
  );
  assert(
    untouched?.refundedTotal === 0,
    "and a refused refund leaves refunded_total at 0 — the bump and the row commit together or not at all",
  );

  console.log("\n[4] partial, then the remainder, then nothing");
  const part = await refundPayment(
    { paymentId: charge.id, amount: 20000, reason: "partial", refundChannel: "cash_drawer" },
    owner,
  );
  assert(part.amount === -20000 && part.isFullRefund === false, "200 EGP of the 500 comes back");
  assert(part.reversalOfId === charge.id, "the refund row points at the receipt it reverses");

  const afterPart = await withPlatformContext((tx) =>
    tx.payment.findUnique({ where: { id: charge.id }, select: { refundedTotal: true } }),
  );
  assert(afterPart?.refundedTotal === 20000, "the ORIGINAL now records what has been returned");

  const overRemainder = await caught(() =>
    refundPayment({ paymentId: charge.id, amount: 40000, reason: "over the remainder", refundChannel: "cash_drawer" }, owner),
  );
  assert(
    overRemainder instanceof BusinessRuleError,
    "a second refund is bounded by what is LEFT, not by the original amount",
  );

  // Multiple partials per receipt (migration 20260908120000): the remainder is
  // a second refund row, and `refunded_total` is the only bound.
  const remainder = await refundPayment(
    { paymentId: charge.id, amount: 30000, reason: "the remainder", refundChannel: "cash_drawer" },
    owner,
  );
  assert(
    remainder.amount === -30000 && remainder.reversalOfId === charge.id,
    "the remaining 300 EGP comes back as a SECOND refund row against the same receipt",
  );
  assert(remainder.isFullRefund === true, "…and the receipt is now fully refunded, across two partials");

  const afterRemainder = await withPlatformContext((tx) =>
    tx.payment.findUnique({ where: { id: charge.id }, select: { refundedTotal: true } }),
  );
  assert(afterRemainder?.refundedTotal === 50000, "refunded_total reached the receipt's amount");

  const nothingLeft = await caught(() =>
    refundPayment({ paymentId: charge.id, amount: 1, reason: "one more piaster", refundChannel: "cash_drawer" }, owner),
  );
  assert(
    nothingLeft instanceof BusinessRuleError,
    "and then nothing: even one piaster more is refused by the bound",
  );

  console.log("\n[5] the CHECK is the floor, not the service");
  const direct = await caught(() =>
    withPlatformContext((tx) =>
      tx.payment.update({ where: { id: charge.id }, data: { refundedTotal: 50001 } }),
    ),
  );
  assert(
    direct !== null,
    "payments_refunded_within_amount refuses an over-refund written straight to the database",
  );

  const refundRows = await withPlatformContext((tx) =>
    tx.payment.count({ where: { centerId: fx.center, studentId: fx.students[0] } }),
  );
  assert(refundRows === 3, "three payment rows — the charge and its two partial refunds");

  console.log("\n[6] refunding PLATFORM-held money leaves the drawer alone");
  await openShift(owner, { openingFloat: 0 });
  await recordPayment({ studentId: fx.students[1], amount: 20000 }, owner);
  const beforeRefund = await myOpenShift(owner);
  assert(beforeRefund?.expectedCashNow === 20000, "the drawer expects the 200 EGP cash it took in");

  const online = await withPlatformContext((tx) =>
    tx.payment.create({
      data: {
        centerId: fx.center,
        studentId: fx.students[1],
        amount: 30000,
        paymentMethod: "online_paymob",
        receiptNumber: `${tag}-ONLINE`,
        recordedBy: fx.owner,
        note: "paid online — the platform holds this money",
      },
    }),
  );
  const onlineRefund = await refundPayment(
    { paymentId: online.id, amount: 30000, reason: "online refund", refundChannel: "cash_drawer" },
    owner,
  );
  assert(
    onlineRefund.paymentMethod === "online_paymob",
    "the refund inherits the original's platform-held method instead of defaulting to cash",
  );
  assert(onlineRefund.shiftId === null, "…and is stamped to no shift — it never touched the till");

  const afterRefund = await myOpenShift(owner);
  const cashBucket = afterRefund?.buckets.find((b) => b.method === "cash");
  assert(
    afterRefund?.expectedCashNow === 20000,
    "expected cash is UNCHANGED — the phantom outflow of 300 EGP is gone",
  );
  assert(
    cashBucket?.refunded === 0,
    "the cash bucket records no refund at all for money the drawer never held",
  );

  const onlineTxn = await withPlatformContext((tx) =>
    tx.transaction.findFirst({
      where: { centerId: fx.center, notes: { contains: onlineRefund.receiptNumber } },
      select: { funding: true, paymentMethod: true, type: true },
    }),
  );
  assert(
    onlineTxn?.type === "refund" && onlineTxn?.funding === "platform_held",
    "the ledger row names the funding it reverses",
  );
  console.log("\n[7] a centre-held refund inherits its original's method too");
  const insta = await recordPayment(
    { studentId: fx.students[1], amount: 10000, paymentMethod: "instapay" },
    owner,
  );
  const instaRefund = await refundPayment(
    { paymentId: insta.id, amount: 10000, reason: "instapay refund", refundChannel: "bank_transfer" },
    owner,
  );
  assert(
    instaRefund.paymentMethod === "instapay",
    "an InstaPay receipt comes back as InstaPay, not as cash out of the drawer",
  );
  const instaTxn = await withPlatformContext((tx) =>
    tx.transaction.findFirst({
      where: { centerId: fx.center, notes: { contains: instaRefund.receiptNumber } },
      select: { notes: true, paymentMethod: true, funding: true },
    }),
  );
  assert(
    instaTxn?.paymentMethod === "instapay" && instaTxn?.funding === "center_held",
    "the ledger row carries the same method and the centre-held funding",
  );
  assert(
    instaTxn?.notes ===
      `Refund via bank_transfer at center (receipt ${instaRefund.receiptNumber}, reversing ${insta.receiptNumber}) — awaiting confirmation`,
    "the ledger note says REFUND, names the receipt it reverses and its channel — it used to read 'Cash payment at center'",
  );

  console.log("\n[8] a positive counter payment is untouched by all of the above");
  const plain = await recordPayment({ studentId: fx.students[1], amount: 5000 }, owner);
  const plainTxn = await withPlatformContext((tx) =>
    tx.transaction.findFirst({
      where: { centerId: fx.center, notes: { contains: plain.receiptNumber } },
      select: { notes: true, funding: true },
    }),
  );
  assert(
    plainTxn?.notes === `Cash payment at center (receipt ${plain.receiptNumber})`,
    "the cash payment note stays byte-identical",
  );
  assert(plainTxn?.funding === "center_held", "and is now stamped with the funding it always had");

  console.log("\n[9] a FULL refund ends coverage; a partial one does not");
  const subscribe = async (paymentId: string) =>
    withPlatformContext((tx) =>
      tx.subscription.create({
        data: {
          studentId: fx.students[2], targetType: "center", teacherId: fx.teacher,
          centerId: fx.center, courseId: fx.course, plan: "monthly", price: 40000,
          status: "active", source: "walk_in", paymentId,
          periodStart: new Date(Date.now() - 86400000),
          periodEnd: new Date(Date.now() + 20 * 86400000),
          activatedAt: new Date(),
        },
        select: { id: true },
      }),
    );

  const chargeA = await recordPayment(
    { studentId: fx.students[2], courseId: fx.course, amount: 40000 },
    owner,
  );
  const subA = await subscribe(chargeA.id);
  const fullRefund = await refundPayment(
    { paymentId: chargeA.id, amount: 40000, reason: "the family withdrew", refundChannel: "cash_drawer" },
    owner,
  );
  assert(fullRefund.isFullRefund === true, "the whole 400 EGP came back");
  assert(
    fullRefund.cancelledSubscriptionIds.includes(subA.id),
    "…and the subscription it paid for is cancelled IN THE SAME TRANSACTION",
  );

  const afterFull = await withPlatformContext((tx) =>
    tx.subscription.findUnique({ where: { id: subA.id }, select: { status: true, cancelledAt: true } }),
  );
  assert(
    afterFull?.status === "cancelled" && afterFull.cancelledAt !== null,
    "coverage is gone, so coveredStudentIds stops returning this student and settlement stops paying out",
  );

  const seat = await withPlatformContext((tx) =>
    tx.enrollment.findFirst({
      where: { studentId: fx.students[2], courseId: fx.course },
      select: { status: true, unenrolledAt: true },
    }),
  );
  assert(
    seat?.status === "active" && seat.unenrolledAt === null,
    "the ROSTER seat is untouched — a refund is a coverage event, not a membership one (CLAUDE.md #2)",
  );

  const chargeB = await recordPayment(
    { studentId: fx.students[2], courseId: fx.course, amount: 40000 },
    owner,
  );
  const subB = await subscribe(chargeB.id);
  const partial = await refundPayment(
    { paymentId: chargeB.id, amount: 10000, reason: "overcharged by 100", refundChannel: "cash_drawer" },
    owner,
  );
  assert(partial.isFullRefund === false, "a partial refund is a correction…");
  const afterPartial = await withPlatformContext((tx) =>
    tx.subscription.findUnique({ where: { id: subB.id }, select: { status: true } }),
  );
  assert(
    afterPartial?.status === "active" && partial.cancelledSubscriptionIds.length === 0,
    "…so coverage survives it — the student keeps the month they are still paying for",
  );

  // THE RULE: a receipt refunded to its full amount ACROSS SEVERAL PARTIALS
  // behaves exactly like one full refund — the partial that brings
  // refunded_total to amount is the one that ends coverage.
  const remainderKey = `refund-remainder-${rid()}`;
  const lastPartial = await refundPayment(
    { paymentId: chargeB.id, amount: 30000, reason: "the rest", refundChannel: "cash_drawer", clientRequestId: remainderKey },
    owner,
  );
  assert(lastPartial.isFullRefund === true, "the partial that completes the amount counts as the full refund");
  const afterLast = await withPlatformContext((tx) =>
    tx.subscription.findUnique({ where: { id: subB.id }, select: { status: true, cancelledAt: true } }),
  );
  assert(
    afterLast?.status === "cancelled" && afterLast.cancelledAt !== null &&
      lastPartial.cancelledSubscriptionIds.includes(subB.id),
    "…and it cancels the subscription in the same transaction, exactly as a single full refund does",
  );

  const replay = await caught(() =>
    refundPayment(
      { paymentId: chargeB.id, amount: 30000, reason: "the rest", refundChannel: "cash_drawer", clientRequestId: remainderKey },
      owner,
    ),
  );
  assert(
    replay instanceof BusinessRuleError,
    "a retry carrying the SAME client_request_id is refused by payments_client_request_unique, not minted again",
  );

  console.log("\n[10] a receipt whose lesson already settled is refused, per STUDENT");
  // Per-session passes here, not monthly: `subs_one_active_monthly` allows only
  // one active monthly per (student, course) and section 9 leaves one standing.
  const pass_ = async (paymentId: string, sessionId: string) =>
    withPlatformContext((tx) =>
      tx.subscription.create({
        data: {
          studentId: fx.students[2], targetType: "center", teacherId: fx.teacher,
          centerId: fx.center, courseId: fx.course, sessionId, plan: "per_session",
          price: 5000, status: "active", source: "walk_in", paymentId,
          activatedAt: new Date(),
        },
        select: { id: true },
      }),
    );

  const chargeC = await recordPayment(
    { studentId: fx.students[2], courseId: fx.course, amount: 5000 },
    owner,
  );
  await pass_(chargeC.id, fx.sessions[0]);

  // The exact row distribution.ts writes per attending student
  // (distribution.ts: type "payment", fromEntityId = studentId, lessonId = sessionId).
  // Written directly so the gate is proven against that shape without running a
  // whole settlement.
  await withPlatformContext((tx) =>
    tx.transaction.create({
      data: {
        refNumber: `${tag}-settled-other`, type: "payment", amount: 5000,
        fromEntityId: fx.students[1], lessonId: fx.sessions[0],
        centerId: fx.center, status: "completed", notes: "Lesson revenue",
      },
    }),
  );
  const otherStudentSettled = await refundPayment(
    { paymentId: chargeC.id, amount: 1000, reason: "another student settled, not this one", refundChannel: "cash_drawer" },
    owner,
  );
  assert(
    otherStudentSettled.amount === -1000,
    "a lesson settled for a DIFFERENT student moved none of this student's money, so it does not block",
  );

  const chargeD = await recordPayment(
    { studentId: fx.students[2], courseId: fx.course, amount: 5000 },
    owner,
  );
  await pass_(chargeD.id, fx.sessions[1]);
  await withPlatformContext((tx) =>
    tx.transaction.create({
      data: {
        refNumber: `${tag}-settled-mine`, type: "payment", amount: 5000,
        fromEntityId: fx.students[2], lessonId: fx.sessions[1],
        centerId: fx.center, status: "completed", notes: "Lesson revenue",
      },
    }),
  );
  const settledErr = await caught(() =>
    refundPayment({ paymentId: chargeD.id, amount: 5000, reason: "too late", refundChannel: "cash_drawer" }, owner),
  );
  assert(
    settledErr instanceof BusinessRuleError,
    "once money has been distributed FOR THIS STUDENT, ERP refuses — the clawback is refundLessonForStudent's job",
  );
  const chargeDAfter = await withPlatformContext((tx) =>
    tx.payment.findUnique({ where: { id: chargeD.id }, select: { refundedTotal: true } }),
  );
  assert(
    chargeDAfter?.refundedTotal === 0,
    "and the refusal leaves the receipt completely untouched",
  );

  console.log("\n[11] Option B — a refund is an OBLIGATION until it is confirmed");
  const chargeE = await recordPayment({ studentId: fx.students[0], amount: 30000 }, owner);
  const armed = await refundPayment(
    { paymentId: chargeE.id, amount: 30000, reason: "cash back", refundChannel: "cash_drawer" },
    owner,
  );
  assert(armed.refundChannel === "cash_drawer", "the refund declares where the money goes back");
  assert(
    armed.refundConfirmedAt === null && armed.refundExternalRef === null,
    "…and starts UNCONFIRMED — the platform has promised the money, not handed it over",
  );

  const armedTxn = await withPlatformContext((tx) =>
    tx.transaction.findFirst({
      where: { paymentId: armed.id, type: "refund" },
      select: { status: true },
    }),
  );
  assert(
    armedTxn?.status === "pending",
    "the ledger row is PENDING, which is what finally makes the superadmin decision-queue tile a live count",
  );

  const queue = await listUnconfirmedRefunds(owner);
  assert(
    queue.some((r) => r.id === armed.id),
    "it appears on the counter's awaiting-confirmation queue",
  );

  console.log("\n[12] confirmation demands evidence, and cannot be replayed");
  const noRef = await caught(() => confirmRefund({ refundPaymentId: armed.id, externalRef: "  " }, owner));
  assert(noRef instanceof BusinessRuleError, "a blank reference is refused before the database sees it");

  const confirmed = await confirmRefund(
    { refundPaymentId: armed.id, externalRef: `${tag}-voucher-1` },
    owner,
  );
  assert(
    confirmed.refundConfirmedAt !== null &&
      confirmed.refundConfirmedBy === fx.owner &&
      confirmed.refundExternalRef === `${tag}-voucher-1`,
    "confirming records the moment, the actor and the proof together — the CHECK accepts no subset",
  );

  const twice = await caught(() =>
    confirmRefund({ refundPaymentId: armed.id, externalRef: `${tag}-voucher-2` }, owner),
  );
  assert(twice instanceof BusinessRuleError, "a second confirmation is refused");

  const trail = await withPlatformContext((tx) =>
    tx.transaction.findMany({
      where: { paymentId: armed.id },
      select: { type: true, status: true, notes: true },
      orderBy: { createdAt: "asc" },
    }),
  );
  assert(
    trail.length === 2 && trail[0].type === "refund" && trail[1].type === "adjustment",
    "the confirmation APPENDS a second row rather than flipping the first — transactions is UPDATE-revoked",
  );
  assert(
    trail[0].status === "pending",
    "and the pending row STAYS pending forever, which is why readers key off payments.refund_confirmed_at",
  );
  assert(
    (trail[1].notes ?? "").includes(`${tag}-voucher-1`),
    "the appended row carries the evidence into the append-only ledger",
  );

  const queueAfter = await listUnconfirmedRefunds(owner);
  assert(
    !queueAfter.some((r) => r.id === armed.id),
    "and it leaves the queue",
  );

  console.log("\n[13] a gateway refund cannot be ARMED until the executor exists (M-05 interim)");
  const onlineB = await withPlatformContext((tx) =>
    tx.payment.create({
      data: {
        centerId: fx.center, studentId: fx.students[0], amount: 15000,
        paymentMethod: "online_paymob", receiptNumber: `${tag}-ONLINE-B`,
        recordedBy: fx.owner, note: "paid online",
      },
    }),
  );
  const gatewayArm = await caught(() =>
    refundPayment(
      { paymentId: onlineB.id, amount: 15000, reason: "reverse it", refundChannel: "gateway" as never },
      owner,
    ),
  );
  assert(
    gatewayArm instanceof BusinessRuleError && /not available yet/.test(gatewayArm.message),
    "arming a `gateway` refund is refused at the service, not only by the route's enum — no obligation nobody can confirm",
  );
  const gatewayRows = await withPlatformContext((tx) =>
    tx.payment.count({ where: { reversalOfId: onlineB.id } }),
  );
  assert(gatewayRows === 0, "…and no refund row was written");
  const byHandOnGateway = confirmRefund; // still refuses `gateway` by design; unreachable until §3.3.2 ships
  void byHandOnGateway;

  console.log("\n[14] two partials racing to complete the SAME receipt");
  // Reachable only since migration 20260908120000 dropped
  // payments_one_refund_per_payment. Both callers read refundedTotal = 0; the
  // conditional bump serialises them correctly, but a service that computed
  // "is this now fully refunded?" by ADDING to the value it read first would
  // see 0 + 300 = 300 on the second one and never cancel the coverage — the
  // continuing overpayment surviving the very change meant to stop it.
  const chargeF = await recordPayment(
    { studentId: fx.students[2], courseId: fx.course, amount: 50000 },
    owner,
  );
  const subF = await withPlatformContext((tx) =>
    tx.subscription.create({
      data: {
        studentId: fx.students[2], targetType: "center", teacherId: fx.teacher,
        centerId: fx.center, courseId: fx.course, sessionId: fx.sessions[2],
        plan: "per_session", price: 50000, status: "active", source: "walk_in",
        paymentId: chargeF.id, activatedAt: new Date(),
      },
      select: { id: true },
    }),
  );

  const [a, b] = await Promise.all([
    refundPayment(
      { paymentId: chargeF.id, amount: 20000, reason: "race a", refundChannel: "cash_drawer" },
      owner,
    ),
    refundPayment(
      { paymentId: chargeF.id, amount: 30000, reason: "race b", refundChannel: "cash_drawer" },
      owner,
    ),
  ]);
  assert(
    Math.abs(a.amount) + Math.abs(b.amount) === 50000,
    "both partials landed and together they return the whole receipt",
  );
  assert(
    [a.isFullRefund, b.isFullRefund].filter(Boolean).length === 1,
    "EXACTLY ONE of them reports the receipt complete — whichever committed second",
  );
  const chargeFAfter = await withPlatformContext((tx) =>
    tx.payment.findUnique({ where: { id: chargeF.id }, select: { refundedTotal: true } }),
  );
  assert(chargeFAfter?.refundedTotal === 50000, "refunded_total lands exactly on the receipt amount");
  const subFAfter = await withPlatformContext((tx) =>
    tx.subscription.findUnique({ where: { id: subF.id }, select: { status: true } }),
  );
  assert(
    subFAfter?.status === "cancelled",
    "…and coverage IS ended, which is the assertion that fails if the total is derived from a stale read",
  );

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
