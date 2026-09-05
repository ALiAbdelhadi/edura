import { withPlatformContext } from "@repo/database";
import {
  parentWalletCredit,
  reconcileParentWallet,
} from "@repo/server-core/services/wallet/parent-wallet";
import { coveredStudentIds } from "@repo/server-core/services/subscriptions/coverage";
import { createSubscriptionCheckout } from "@/lib/services/subscriptions/subscriptions";
import {
  initiateSubscriptionIntent,
  processWebhookEvent,
  getIntentForStudent,
} from "@/lib/services/payments/payment-intents";
import { initiateParentWalletTopUpIntent } from "@/lib/services/wallet/parent-wallet";
import type { SessionUser } from "@/lib/auth/session";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "parent-pay.test.ts";

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

const asParent = (id: string): SessionUser => ({ id, role: "parent" }) as SessionUser;
const asStudent = (id: string): SessionUser => ({ id, role: "student" }) as SessionUser;

async function mkParent(tag: string, balance = 0) {
  return withPlatformContext(async (tx) => {
    const u = await tx.user.create({
      data: { name: `${tag}-p`, role: "parent", email: `${tag}-p@x.io`, status: "active" },
    });
    await tx.parentProfile.create({ data: { userId: u.id, walletBalance: balance } });
    return u.id;
  });
}

async function mkStudent(tag: string, balance = 0) {
  return withPlatformContext(async (tx) => {
    const u = await tx.user.create({
      data: { name: `${tag}-s`, role: "student", email: `${tag}-s@x.io`, status: "active" },
    });
    await tx.studentProfile.create({
      data: {
        userId: u.id,
        fullName: `${tag}-s`,
        familyLinkCode: ("FC" + rid() + rid()).slice(0, 18),
        walletBalance: balance,
      },
    });
    return u.id;
  });
}

async function link(
  parentId: string,
  studentId: string,
  status: "approved" | "pending" | "revoked",
) {
  return withPlatformContext((tx) =>
    tx.parentStudentLink.create({
      data: { parentId, studentId, status, initiatedBy: "parent" },
    }),
  );
}

async function mkCourse(tag: string, opts?: { perMonth?: number; perSession?: number }) {
  return withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({
      data: { name: `${tag}-t`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
    await tx.teacherProfile.create({ data: { userId: teacher.id, walletBalance: 0 } });
    const center = await tx.center.create({
      data: {
        name: `${tag}-c`,
        shortId: ("C" + rid() + rid()).slice(0, 12).toUpperCase(),
        status: "active",
        walletBalance: 0,
      },
    });
    const course = await tx.course.create({
      data: {
        centerId: center.id,
        teacherId: teacher.id,
        title: `${tag}-course`,
        subject: "Math",
        daysOfWeek: [1],
        startTime: "10:00",
        endTime: "11:00",
        startDate: new Date("2026-01-01T00:00:00Z"),
        price: opts?.perMonth ?? 20000,
        pricePerMonth: opts?.perMonth ?? 20000,
        pricePerSession: opts?.perSession ?? 5000,
        maxStudents: 30,
        status: "active",
      },
    });
    const session = await tx.session.create({
      data: {
        courseId: course.id,
        teacherId: teacher.id,
        date: new Date("2026-12-01T00:00:00Z"),
        originalDate: new Date("2026-12-01T00:00:00Z"),
        startTime: "10:00",
        endTime: "11:00",
      },
    });
    return { teacherId: teacher.id, centerId: center.id, courseId: course.id, session };
  });
}

const parentBalance = (parentId: string) =>
  withPlatformContext(async (tx) => {
    const p = await tx.parentProfile.findUnique({
      where: { userId: parentId },
      select: { walletBalance: true },
    });
    return p!.walletBalance;
  });

const studentBalance = (studentId: string) =>
  withPlatformContext(async (tx) => {
    const p = await tx.studentProfile.findUnique({
      where: { userId: studentId },
      select: { walletBalance: true },
    });
    return p!.walletBalance;
  });

async function settleLatestIntent(subscriptionId: string, tag: string) {
  const intent = await withPlatformContext((tx) =>
    tx.paymentIntent.findFirst({
      where: { subscriptionId },
      orderBy: { createdAt: "desc" },
    }),
  );
  const result = await processWebhookEvent(
    {
      gatewayOrderId: intent!.gatewayOrderId as string,
      success: true,
      gatewayRef: `ref-${tag}-${rid()}`,
      reason: null,
      kind: "capture",
      amountMinor: intent!.amount,
      currency: intent!.currency,
      integrationId: null,
      parentRef: null,
      occurredAt: null,
    },
    { mock: true },
  );
  return { intent: intent!, result };
}

const errOf = (e: unknown) => String((e as { message?: string })?.message ?? e);

async function main() {
  const tag = "ppay-" + rid();
  __sweepTag = tag;
  console.log("Parent-pays-for-child DB tests —", tag);

  console.log("\nProof 1 — the approved-link GATE");
  {
    const fx = await mkCourse(tag + "g");
    const child = await mkStudent(tag + "g");
    const stranger = await mkParent(tag + "g1");
    const pendingP = await mkParent(tag + "g2");
    const revokedP = await mkParent(tag + "g3");
    await link(pendingP, child, "pending");
    await link(revokedP, child, "revoked");

    for (const [who, id, label] of [
      ["no link", stranger, "a parent with NO link"],
      ["pending", pendingP, "a parent with a PENDING link"],
      ["revoked", revokedP, "a parent with a REVOKED link"],
    ] as const) {
      void who;
      let threw = false;
      let msg = "";
      try {
        await createSubscriptionCheckout(
          {
            courseId: fx.courseId,
            studentId: child,
            plan: "per_session",
            sessionId: fx.session.id,
            method: "card",
            idempotencyKey: `gate-${tag}-${rid()}`,
          },
          asParent(id),
          initiateSubscriptionIntent,
        );
      } catch (e) {
        threw = true;
        msg = errOf(e);
      }
      assert(threw && /approved child/i.test(msg), `${label} is refused (${msg.slice(0, 40)})`);
    }

    let threwNoChild = false;
    try {
      await createSubscriptionCheckout(
        {
          courseId: fx.courseId,
          plan: "monthly",
          method: "card",
          idempotencyKey: `gate-${tag}-${rid()}`,
        },
        asParent(stranger),
        initiateSubscriptionIntent,
      );
    } catch {
      threwNoChild = true;
    }
    assert(threwNoChild, "a parent with NO studentId is refused (no implicit child)");

    const orphans = await withPlatformContext((tx) =>
      tx.subscription.count({ where: { courseId: fx.courseId } }),
    );
    assert(orphans === 0, `no subscription row was created by any refused attempt (${orphans})`);
  }

  console.log("\nProof 2 — parent buys a PER-SESSION pass via the gateway");
  {
    const fx = await mkCourse(tag + "s", { perSession: 7500 });
    const child = await mkStudent(tag + "s");
    const parent = await mkParent(tag + "s");
    await link(parent, child, "approved");

    const res = (await createSubscriptionCheckout(
      {
        courseId: fx.courseId,
        studentId: child,
        plan: "per_session",
        sessionId: fx.session.id,
        method: "card",
        idempotencyKey: `ps-${tag}-${rid()}`,
      },
      asParent(parent),
      initiateSubscriptionIntent,
    )) as { id: string; amount: number };

    assert(res.amount === 7500, `intent amount is the SERVER price snapshot (${res.amount})`);

    const sub0 = await withPlatformContext((tx) =>
      tx.subscription.findFirst({ where: { studentId: child, courseId: fx.courseId } }),
    );
    assert(sub0?.status === "pending_payment", "subscription starts pending_payment");
    assert(sub0?.createdBy === parent, "createdBy attributes the PARENT who acted");
    assert(sub0?.sessionId === fx.session.id, "the pass is tied to the chosen session");

    const { intent, result } = await settleLatestIntent(sub0!.id, tag);
    assert(intent.payerUserId === parent, "the intent records the PARENT as payer");
    assert(intent.studentId === child, "the intent records the CHILD as beneficiary");
    assert((result as { result?: string }).result === "paid", "webhook settled the intent");

    const sub = await withPlatformContext((tx) =>
      tx.subscription.findUnique({ where: { id: sub0!.id } }),
    );
    assert(sub?.status === "active", "subscription is ACTIVE after settlement");
    assert(!!sub?.enrollmentId, "the wrapped enrollment was created");

    const enrollment = await withPlatformContext((tx) =>
      tx.enrollment.findFirst({ where: { studentId: child, courseId: fx.courseId } }),
    );
    assert(enrollment?.status === "active", "the CHILD is on the roster (active enrollment)");

    const payment = await withPlatformContext((tx) =>
      tx.payment.findFirst({ where: { studentId: child, courseId: fx.courseId } }),
    );
    assert(payment?.amount === 7500, `Payment recorded for the child (${payment?.amount})`);
    assert(payment?.payerUserId === parent, "Payment names the PARENT as payer");

    console.log("\nProof 3 — money DIRECTION is unchanged by who paid");
    const txn = await withPlatformContext((t) =>
      t.transaction.findFirst({
        where: { type: "payment", centerId: fx.centerId },
        orderBy: { createdAt: "desc" },
      }),
    );
    assert(
      txn?.fromEntityId === child,
      "ledger Transaction still moves STUDENT -> center (not parent -> center)",
    );
    assert(txn?.toEntityId === fx.centerId, "…and lands on the center exactly as before");

    const covered = await withPlatformContext((t) =>
      coveredStudentIds(t, { id: fx.session.id, courseId: fx.courseId, date: fx.session.date }, [
        child,
      ]),
    );
    assert(covered.has(child), "coveredStudentIds: the child IS covered for that session");

    console.log("\nProof 10 — duplicate guard still bites");
    let dupThrew = false;
    let dupMsg = "";
    try {
      await createSubscriptionCheckout(
        {
          courseId: fx.courseId,
          studentId: child,
          plan: "per_session",
          sessionId: fx.session.id,
          method: "card",
          idempotencyKey: `ps-dup-${tag}-${rid()}`,
        },
        asParent(parent),
        initiateSubscriptionIntent,
      );
    } catch (e) {
      dupThrew = true;
      dupMsg = errOf(e);
    }
    assert(
      dupThrew && /already exists/i.test(dupMsg),
      "a second pass for the SAME session is refused",
    );

    console.log("\nProof 9 — intent ownership");
    const other = await mkParent(tag + "s9");
    let otherThrew = false;
    try {
      await getIntentForStudent(intent.id, asParent(other));
    } catch {
      otherThrew = true;
    }
    assert(otherThrew, "another PARENT cannot poll this intent");

    let childThrew = false;
    try {
      await getIntentForStudent(intent.id, asStudent(child));
    } catch {
      childThrew = true;
    }
    assert(childThrew, "the CHILD cannot poll the intent their parent is paying");

    const mine = await getIntentForStudent(intent.id, asParent(parent));
    assert(!!mine, "the paying parent CAN poll their own intent");
  }

  console.log("\nProof 4 — parent buys a MONTHLY subscription");
  {
    const fx = await mkCourse(tag + "m", { perMonth: 30000 });
    const child = await mkStudent(tag + "m");
    const parent = await mkParent(tag + "m");
    await link(parent, child, "approved");

    await createSubscriptionCheckout(
      {
        courseId: fx.courseId,
        studentId: child,
        plan: "monthly",
        method: "card",
        idempotencyKey: `mo-${tag}-${rid()}`,
      },
      asParent(parent),
      initiateSubscriptionIntent,
    );
    const sub0 = await withPlatformContext((tx) =>
      tx.subscription.findFirst({ where: { studentId: child, courseId: fx.courseId } }),
    );
    await settleLatestIntent(sub0!.id, tag);
    const sub = await withPlatformContext((tx) =>
      tx.subscription.findUnique({ where: { id: sub0!.id } }),
    );
    assert(sub?.status === "active", "monthly subscription is ACTIVE");
    assert(sub?.price === 30000, `monthly price snapshot (${sub?.price})`);
    assert(!!sub?.periodStart && !!sub?.periodEnd, "monthly coverage window was set");
    assert(sub?.sessionId === null, "a monthly subscription is tied to NO single session");
  }

  console.log("\nProof 5 — parent wallet top-up credits ONCE and reconciles");
  {
    const parent = await mkParent(tag + "w");
    await initiateParentWalletTopUpIntent(
      { amount: 40000, method: "card", idempotencyKey: `pw-${tag}-${rid()}` },
      asParent(parent),
    );
    const intent = await withPlatformContext((tx) =>
      tx.paymentIntent.findFirst({
        where: { payerUserId: parent, purpose: "parent_wallet_topup" },
        orderBy: { createdAt: "desc" },
      }),
    );
    assert(intent?.studentId === null, "a parent top-up intent has NO beneficiary student");

    const event = {
      gatewayOrderId: intent!.gatewayOrderId as string,
      success: true,
      gatewayRef: `ref-${tag}`,
      reason: null,
      kind: "capture" as const,
      amountMinor: intent!.amount,
      currency: intent!.currency,
      integrationId: null,
      parentRef: null,
      occurredAt: null,
    };
    const r1 = await processWebhookEvent(event, { mock: true });
    const afterFirst = await parentBalance(parent);
    const r2 = await processWebhookEvent(event, { mock: true }); // replay
    const afterReplay = await parentBalance(parent);

    assert((r1 as { result?: string }).result === "paid", "first webhook settled (paid)");
    assert(afterFirst === 40000, `parent wallet credited once (+40000, got ${afterFirst})`);
    assert((r2 as { result?: string }).result === "replay", "replayed webhook is a no-op");
    assert(afterReplay === 40000, `balance UNCHANGED after replay (still ${afterReplay})`);

    const rec = await withPlatformContext((tx) => reconcileParentWallet(tx, parent));
    assert(
      rec.ok,
      `reconciles: cached(${rec.cached}) == SUM delta(${rec.ledgerSum}) == last balanceAfter(${rec.lastBalanceAfter})`,
    );

    const rows = await withPlatformContext((tx) =>
      tx.parentWalletLedger.count({
        where: { parentId: parent, type: "topup", paymentIntentId: intent!.id },
      }),
    );
    assert(rows === 1, `exactly ONE top-up ledger row for the intent (got ${rows})`);
  }

  console.log("\nProof 6 — paying from the PARENT wallet settles synchronously");
  {
    const fx = await mkCourse(tag + "pw", { perSession: 6000 });
    const child = await mkStudent(tag + "pw", 9999); // the child's own balance, untouched
    const parent = await mkParent(tag + "pw");
    await link(parent, child, "approved");
    await withPlatformContext((tx) =>
      parentWalletCredit(tx, parent, 20000, {
        type: "topup",
        method: "online_paymob",
        reason: "opening",
      }),
    );

    const res = (await createSubscriptionCheckout(
      {
        courseId: fx.courseId,
        studentId: child,
        plan: "per_session",
        sessionId: fx.session.id,
        method: "card",
        payFrom: "parent_wallet",
        idempotencyKey: `pww-${tag}-${rid()}`,
      },
      asParent(parent),
      initiateSubscriptionIntent,
    )) as { walletPaid?: boolean; status?: string; receiptNumber?: string };

    assert(res.walletPaid === true, "wallet checkout returns walletPaid (no gateway leg)");
    assert(res.status === "active", "subscription is ACTIVE immediately");
    assert(!!res.receiptNumber, `a receipt was issued (${res.receiptNumber})`);

    const pBal = await parentBalance(parent);
    const sBal = await studentBalance(child);
    assert(pBal === 14000, `the PARENT was debited 6000 (20000 -> ${pBal})`);
    assert(sBal === 9999, `the CHILD's balance is UNTOUCHED (still ${sBal})`);

    const entry = await withPlatformContext((tx) =>
      tx.parentWalletLedger.findFirst({
        where: { parentId: parent, type: "payment" },
        orderBy: { createdAt: "desc" },
      }),
    );
    assert(entry?.delta === -6000, `ledger records the spend (delta ${entry?.delta})`);
    assert(
      entry?.beneficiaryStudentId === child,
      "the ledger row names WHICH child the money was spent on",
    );

    const rec = await withPlatformContext((tx) => reconcileParentWallet(tx, parent));
    assert(rec.ok, "the parent wallet still reconciles after a spend");

    const payment = await withPlatformContext((tx) =>
      tx.payment.findFirst({
        where: { studentId: child, courseId: fx.courseId },
        orderBy: { createdAt: "desc" },
      }),
    );
    assert(payment?.payerUserId === parent, "the Payment names the parent as payer");

    const covered = await withPlatformContext((t) =>
      coveredStudentIds(t, { id: fx.session.id, courseId: fx.courseId, date: fx.session.date }, [
        child,
      ]),
    );
    assert(covered.has(child), "the child is covered for the session they paid for");
  }

  console.log("\nProof 7 — insufficient parent balance is cleanly rejected");
  {
    const fx = await mkCourse(tag + "ins", { perSession: 50000 });
    const child = await mkStudent(tag + "ins");
    const parent = await mkParent(tag + "ins");
    await link(parent, child, "approved");
    await withPlatformContext((tx) =>
      parentWalletCredit(tx, parent, 1000, { type: "topup", method: "cash", reason: "opening" }),
    );

    let threw = false;
    let msg = "";
    try {
      await createSubscriptionCheckout(
        {
          courseId: fx.courseId,
          studentId: child,
          plan: "per_session",
          sessionId: fx.session.id,
          method: "card",
          payFrom: "parent_wallet",
          idempotencyKey: `ins-${tag}-${rid()}`,
        },
        asParent(parent),
        initiateSubscriptionIntent,
      );
    } catch (e) {
      threw = true;
      msg = errOf(e);
    }
    assert(threw && /insufficient/i.test(msg), `refused with 'Insufficient' (${msg.slice(0, 40)})`);

    const bal = await parentBalance(parent);
    assert(bal === 1000, `NO partial debit — balance untouched (${bal})`);

    const subs = await withPlatformContext((tx) =>
      tx.subscription.count({ where: { studentId: child, courseId: fx.courseId } }),
    );
    assert(subs === 0, `the whole tx rolled back — no orphan subscription (${subs})`);

    const enrol = await withPlatformContext((tx) =>
      tx.enrollment.count({ where: { studentId: child, courseId: fx.courseId } }),
    );
    assert(enrol === 0, `…and no enrollment (${enrol})`);

    const rec = await withPlatformContext((tx) => reconcileParentWallet(tx, parent));
    assert(rec.ok, "the parent wallet still reconciles after the rejection");
  }

  console.log("\nProof 8 — a parent may NOT spend their child's wallet");
  {
    const fx = await mkCourse(tag + "x", { perSession: 3000 });
    const child = await mkStudent(tag + "x", 100000); // plenty of the CHILD's money
    const parent = await mkParent(tag + "x");
    await link(parent, child, "approved");

    let threw = false;
    let msg = "";
    try {
      await createSubscriptionCheckout(
        {
          courseId: fx.courseId,
          studentId: child,
          plan: "per_session",
          sessionId: fx.session.id,
          method: "card",
          payFrom: "wallet", // the CHILD's balance
          idempotencyKey: `x-${tag}-${rid()}`,
        },
        asParent(parent),
        initiateSubscriptionIntent,
      );
    } catch (e) {
      threw = true;
      msg = errOf(e);
    }
    assert(threw, `payFrom=wallet as a parent is refused (${msg.slice(0, 50)})`);
    const sBal = await studentBalance(child);
    assert(sBal === 100000, `the child's balance is untouched (${sBal})`);

    let studentThrew = false;
    try {
      await createSubscriptionCheckout(
        {
          courseId: fx.courseId,
          plan: "per_session",
          sessionId: fx.session.id,
          method: "card",
          payFrom: "parent_wallet",
          idempotencyKey: `x2-${tag}-${rid()}`,
        },
        asStudent(child),
        initiateSubscriptionIntent,
      );
    } catch {
      studentThrew = true;
    }
    assert(studentThrew, "a STUDENT cannot pay from a parent wallet either");

    let impersonate = false;
    try {
      await createSubscriptionCheckout(
        {
          courseId: fx.courseId,
          studentId: parent, // not themselves
          plan: "monthly",
          method: "card",
          idempotencyKey: `x3-${tag}-${rid()}`,
        },
        asStudent(child),
        initiateSubscriptionIntent,
      );
    } catch {
      impersonate = true;
    }
    assert(impersonate, "a student naming ANOTHER studentId is refused");
  }

  console.log("\nProof 11 — an idempotency key belongs to its payer");
  {
    const fx = await mkCourse(tag + "idem", { perMonth: 12000 });
    const childA = await mkStudent(tag + "idemA");
    const childB = await mkStudent(tag + "idemB");
    const parentA = await mkParent(tag + "idemA");
    const parentB = await mkParent(tag + "idemB");
    await link(parentA, childA, "approved");
    await link(parentB, childB, "approved");

    const key = `shared-${tag}-${rid()}`;
    await createSubscriptionCheckout(
      {
        courseId: fx.courseId,
        studentId: childA,
        plan: "monthly",
        method: "card",
        idempotencyKey: key,
      },
      asParent(parentA),
      initiateSubscriptionIntent,
    );

    let threw = false;
    let msg = "";
    try {
      await createSubscriptionCheckout(
        {
          courseId: fx.courseId,
          studentId: childB,
          plan: "monthly",
          method: "card",
          idempotencyKey: key,
        },
        asParent(parentB),
        initiateSubscriptionIntent,
      );
    } catch (e) {
      threw = true;
      msg = errOf(e);
    }
    assert(
      threw && /another user/i.test(msg),
      `a second parent reusing the key is refused (${msg.slice(0, 45)})`,
    );
  }

  console.log("\nProof 12 — the STUDENT path is untouched");
  {
    const fx = await mkCourse(tag + "self", { perMonth: 15000 });
    const student = await mkStudent(tag + "self");

    await createSubscriptionCheckout(
      {
        courseId: fx.courseId,
        plan: "monthly",
        method: "card",
        idempotencyKey: `self-${tag}-${rid()}`,
      },
      asStudent(student),
      initiateSubscriptionIntent,
    );
    const sub0 = await withPlatformContext((tx) =>
      tx.subscription.findFirst({ where: { studentId: student, courseId: fx.courseId } }),
    );
    assert(sub0?.createdBy === null, "a self-checkout records NO createdBy (unchanged)");

    const { intent } = await settleLatestIntent(sub0!.id, tag);
    assert(intent.payerUserId === null, "a self-checkout intent records NO payer (unchanged)");

    const sub = await withPlatformContext((tx) =>
      tx.subscription.findUnique({ where: { id: sub0!.id } }),
    );
    assert(sub?.status === "active", "the student's own subscription still activates");

    const payment = await withPlatformContext((tx) =>
      tx.payment.findFirst({ where: { studentId: student, courseId: fx.courseId } }),
    );
    assert(payment?.payerUserId === null, "the Payment records NO payer for a self-checkout");
    assert(payment?.recordedBy === student, "recordedBy is still the student themselves");
  }

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
