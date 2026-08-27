import { withPlatformContext } from "@repo/database";
import {
  createWalkInSubscription,
  COUNTER_METHODS,
} from "@repo/server-core/services/subscriptions/subscriptions";
import { recordPayment } from "@repo/server-core/services/payments/payments";
import { buildReceiptDocument } from "@repo/server-core/services/payments/receipt-document";
import type { SessionUser } from "@repo/server-core/auth/types";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "counter-payment-methods.test.ts";

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
const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const tag = "cpm-" + rid();
  __sweepTag = tag;
  console.log("Counter payment methods DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({
      data: { name: `${tag}-teacher`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
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
    await tx.centerTeacherAffiliation.create({
      data: {
        centerId: center.id, teacherId: teacher.id, status: "active", centerShare: 0,
        expiresAt: new Date(Date.now() + 30 * DAY),
      },
    });
    const course = await tx.course.create({
      data: {
        centerId: center.id, teacherId: teacher.id, title: `${tag}-c`, subject: "Math",
        daysOfWeek: [1], startTime: "10:00", endTime: "11:00",
        startDate: new Date(Date.now() - 30 * DAY),
        maxStudents: 30, status: "active", price: 40000, pricePerSession: 5000,
      },
    });
    const students: string[] = [];
    for (let i = 0; i < 5; i++) {
      const stu = await tx.user.create({
        data: { name: `${tag}-stu${i}`, role: "student", email: `${tag}-s${i}@x.io`, status: "active" },
      });
      students.push(stu.id);
      await tx.studentProfile.create({
        data: { userId: stu.id, fullName: `${tag}-stu${i}`, familyLinkCode: `${tag.toUpperCase()}F${i}` },
      });
      await tx.centerStudentRoster.create({ data: { centerId: center.id, studentId: stu.id } });
      await tx.enrollment.create({
        data: { studentId: stu.id, courseId: course.id, centerId: center.id, status: "active", enrolledBy: teacher.id },
      });
    }
    const sessions: string[] = [];
    for (let i = 0; i < 5; i++) {
      const sess = await tx.session.create({
        data: {
          courseId: course.id, teacherId: teacher.id,
          originalDate: new Date(Date.now() + (i + 1) * DAY), date: new Date(Date.now() + (i + 1) * DAY),
          startTime: "10:00", endTime: "11:00", status: "scheduled",
        },
      });
      sessions.push(sess.id);
    }
    return { owner: owner.id, center: center.id, course: course.id, students, sessions };
  });

  const ownerUser = { id: fx.owner, role: "center_admin", centerId: fx.center } as unknown as SessionUser;

  console.log("\n[1] each method round-trips identically across all three money rows");
  for (let i = 0; i < COUNTER_METHODS.length; i++) {
    const method = COUNTER_METHODS[i];
    const sub = await createWalkInSubscription(
      {
        studentId: fx.students[i],
        courseId: fx.course,
        plan: "per_session",
        sessionId: fx.sessions[i],
        paymentMethod: method,
      },
      ownerUser,
    );
    const rows = await withPlatformContext(async (tx) => {
      const subscription = await tx.subscription.findUnique({
        where: { id: sub.id },
        select: { paymentMethod: true, paymentId: true },
      });
      const payment = subscription?.paymentId
        ? await tx.payment.findUnique({
            where: { id: subscription.paymentId },
            select: { id: true, paymentMethod: true, note: true },
          })
        : null;
      const txn = await tx.transaction.findFirst({
        where: { centerId: fx.center, type: "payment", notes: { contains: sub.id } },
        select: { paymentMethod: true },
      });
      const points = await tx.pointsLedger.findFirst({
        where: { studentId: fx.students[i] },
        orderBy: { createdAt: "desc" },
        select: { eventName: true },
      });
      return { subscription, payment, txn, points };
    });
    assert(
      rows.subscription?.paymentMethod === method &&
        rows.payment?.paymentMethod === method &&
        rows.txn?.paymentMethod === method,
      `${method}: subscription + payment + ledger all say '${method}'`,
    );
    assert(
      rows.points?.eventName === "cash_payment",
      `${method}: points event is cash_payment — an in-person payment whatever the channel`,
    );
    if (method === "cash") {
      assert(
        rows.payment?.note === "Subscription (per_session, cash)",
        "cash note byte-identical to before Phase 1",
      );
    } else {
      assert(
        rows.payment?.note === `Subscription (per_session, ${method})`,
        `${method}: the note names the channel, not 'online'`,
      );
    }
    if (rows.payment) {
      const doc = await buildReceiptDocument(rows.payment.id, ownerUser);
      assert(doc.paymentMethod === method, `${method}: the printable receipt states the method`);
    }
  }

  console.log("\n[2] the default is cash, at the service");
  const dflt = await createWalkInSubscription(
    {
      studentId: fx.students[4],
      courseId: fx.course,
      plan: "per_session",
      sessionId: fx.sessions[4],
    },
    ownerUser,
  );
  const dfltRows = await withPlatformContext(async (tx) => {
    const subscription = await tx.subscription.findUnique({
      where: { id: dflt.id },
      select: { paymentMethod: true, paymentId: true },
    });
    const payment = subscription?.paymentId
      ? await tx.payment.findUnique({
          where: { id: subscription.paymentId },
          select: { paymentMethod: true, note: true },
        })
      : null;
    return { subscription, payment };
  });
  assert(
    dfltRows.subscription?.paymentMethod === "cash" && dfltRows.payment?.paymentMethod === "cash",
    "an input without a method records cash",
  );
  assert(
    dfltRows.payment?.note === "Subscription (per_session, cash)",
    "…with the pre-Phase-1 note, byte-identical",
  );

  console.log("\n[3] the manual desk records the channel too");
  const manual = await recordPayment(
    { studentId: fx.students[0], amount: 7000, paymentMethod: "instapay" },
    ownerUser,
  );
  const manualRows = await withPlatformContext(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: manual.id },
      select: { paymentMethod: true },
    });
    const txn = await tx.transaction.findFirst({
      where: { centerId: fx.center, notes: { contains: manual.receiptNumber } },
      select: { paymentMethod: true, notes: true },
    });
    return { payment, txn };
  });
  assert(
    manualRows.payment?.paymentMethod === "instapay" && manualRows.txn?.paymentMethod === "instapay",
    "manual instapay entry lands on payment + ledger",
  );
  const manualCash = await recordPayment({ studentId: fx.students[1], amount: 7000 }, ownerUser);
  const cashTxn = await withPlatformContext((tx) =>
    tx.transaction.findFirst({
      where: { centerId: fx.center, notes: { contains: manualCash.receiptNumber } },
      select: { paymentMethod: true, notes: true },
    }),
  );
  assert(
    cashTxn?.paymentMethod === "cash" &&
      cashTxn?.notes === `Cash payment at center (receipt ${manualCash.receiptNumber})`,
    "manual desk default is cash with the pre-Phase-1 note, byte-identical",
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
