import { platformDb, scopedDb, type TenantTx } from "../../db/scope";
import { runEffects, type WithEffects } from "../../db/effects";
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
} from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import type { Course, Prisma, Session, Subscription } from "@repo/database";
import { notify } from "../../services/notifications/notify";
import { studentAndParents } from "../../services/notifications/fanout";
import type { SettleNotification } from "../../services/payments/notification-types";
import { sendPaymentReceiptEmail } from "../../services/payments/receipt-email";
import { trackFirstPayment } from "../../services/analytics/funnel";
import { awardPoints } from "../../services/points/points";
import { nextTxnRef } from "../../services/finance/ref-numbers";
import { computeTeacherDirectSplit } from "../../services/finance/fees";
import { resolveCommission } from "../../services/finance/commission";
import { assertNotBlacklisted } from "../../services/blacklist/blacklist";
import { lockSessionRow } from "../attendance/lesson-lock";
import { openShiftIdFor } from "../center/shifts";
import { fundingOfMethod } from "../finance/center-credit";
import { walletDebit } from "../../services/wallet/wallet";
import { startOfPlatformDay, todayKey } from "../../lib/date-key";
import {
  parentWalletDebit,
  assertApprovedChild,
} from "../../services/wallet/parent-wallet";
import { creditRefundTarget, resolvePayerTarget } from "../../services/wallet/refund-target";
import { resolveFinanceStaff } from "../../services/notifications/fanout";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000; // monthly coverage window

/**
 * SECURITY_AUDIT.md (2026-09-11) BIZ-03. The window used to open at the
 * instant of purchase, while `coverage.ts` compares `periodStart <= session.date`
 * and sessions are dated at midnight — so a student who paid the month at
 * 15:00 was `needs_payment` for that afternoon's lesson and covered on day 30
 * instead. The window now opens at the start of the platform day the purchase
 * falls in and closes just before the same instant 30 days later: thirty
 * dated lessons, the first of them today.
 */
export function monthlyWindow(now: Date): { periodStart: Date; periodEnd: Date } {
  const periodStart = startOfPlatformDay(todayKey(now));
  return { periodStart, periodEnd: new Date(periodStart.getTime() + MONTH_MS - 1) };
}
const PENDING_TTL_MS = 24 * 60 * 60 * 1000; // stale pending_payment sweep

type PlanChoice = { plan: "monthly" | "per_session"; sessionId?: string | null };

async function resolvePlan(
  tx: TenantTx,
  course: Course,
  choice: PlanChoice,
): Promise<{ price: number; session: Session | null }> {
  if (choice.plan === "monthly") {
    if (!course.pricePerMonth) {
      throw new BusinessRuleError("Monthly plan is not enabled for this course");
    }
    return { price: course.pricePerMonth, session: null };
  }

  if (!course.pricePerSession) {
    throw new BusinessRuleError("Per-session plan is not enabled for this course");
  }
  if (!choice.sessionId) {
    throw new BusinessRuleError("sessionId is required for a per-session pass");
  }
  await lockSessionRow(tx, choice.sessionId);
  const session = await tx.session.findUnique({ where: { id: choice.sessionId } });
  if (!session || session.courseId !== course.id) {
    throw new NotFoundError("Session not found on this course");
  }
  if (session.status === "cancelled" || session.status === "completed" || session.distributedAt) {
    throw new BusinessRuleError("This session can no longer be booked");
  }
  return { price: course.pricePerSession, session };
}

function subscriptionShell(
  course: Course,
  studentId: string,
  choice: PlanChoice,
  price: number,
  source: "online" | "walk_in",
  createdBy?: string,
): Prisma.SubscriptionUncheckedCreateInput {
  return {
    studentId,
    targetType: course.centerId ? "center" : "teacher",
    teacherId: course.teacherId,
    centerId: course.centerId,
    courseId: course.id,
    sessionId: choice.plan === "per_session" ? choice.sessionId : null,
    subjectId: course.subjectId,
    gradeLevelId: course.gradeLevelId,
    trackId: course.trackId,
    plan: choice.plan,
    price,
    source,
    createdBy: createdBy ?? null,
    dataSource: course.dataSource,
  };
}

async function assertNoDuplicateActive(
  tx: TenantTx,
  studentId: string,
  courseId: string,
  choice: PlanChoice,
): Promise<void> {
  const clash = await tx.subscription.findFirst({
    where:
      choice.plan === "monthly"
        ? { studentId, courseId, plan: "monthly", status: "active" }
        : { studentId, sessionId: choice.sessionId, plan: "per_session", status: "active" },
    select: { id: true },
  });
  if (clash) {
    throw new BusinessRuleError(
      choice.plan === "monthly"
        ? "An active monthly subscription for this course already exists"
        : "An active pass for this session already exists",
    );
  }
}

export const COUNTER_METHODS = ["cash", "instapay", "pos_card", "mobile_wallet"] as const;
export type CounterMethod = (typeof COUNTER_METHODS)[number];

export type FundingMethod = CounterMethod | "online_paymob" | "wallet";

function isCounterMethod(method: FundingMethod): method is CounterMethod {
  return (COUNTER_METHODS as readonly string[]).includes(method);
}

async function activateSubscription(
  tx: TenantTx,
  subscriptionId: string,
  opts: {
    paymentMethod: FundingMethod;
    paymentId?: string | null;
    enrolledBy: string;
  },
): Promise<Subscription> {
  const sub = await tx.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) throw new NotFoundError("Subscription not found");

  let enrollment = await tx.enrollment.findFirst({
    where: { studentId: sub.studentId, courseId: sub.courseId, status: "active" },
  });
  if (!enrollment) {
    enrollment = await tx.enrollment.create({
      data: {
        studentId: sub.studentId,
        courseId: sub.courseId,
        centerId: sub.centerId,
        enrolledBy: opts.enrolledBy,
        dataSource: sub.dataSource,
      },
    });
  }

  const now = new Date();
  const window = sub.plan === "monthly" ? monthlyWindow(now) : null;
  return tx.subscription.update({
    where: { id: sub.id },
    data: {
      status: "active",
      activatedAt: now,
      paymentMethod: opts.paymentMethod,
      paymentId: opts.paymentId ?? undefined,
      enrollmentId: enrollment.id,
      periodStart: window?.periodStart ?? null,
      periodEnd: window?.periodEnd ?? null,
    },
  });
}

function formatCenterReceipt(shortId: string, seq: number): string {
  return `RCP-${shortId}-${new Date().getFullYear()}-${String(seq).padStart(5, "0")}`;
}

async function nextPlatformReceipt(tx: TenantTx): Promise<string> {
  const rows = await tx.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('platform_receipt_seq'::regclass)`;
  return `RCP-EDURA-${new Date().getFullYear()}-${String(Number(rows[0].nextval)).padStart(5, "0")}`;
}

async function settleSubscriptionMoney(
  tx: TenantTx,
  sub: Subscription,
  method: FundingMethod,
  gatewayRef: string | null,
  recordedBy: string,
  payerUserId: string | null = null,
): Promise<{ paymentId: string; receiptNumber: string }> {
  if (method === "wallet") {
    if (payerUserId) {
      await parentWalletDebit(tx, payerUserId, sub.price, {
        type: "payment",
        beneficiaryStudentId: sub.studentId,
        method: "wallet",
        subscriptionId: sub.id,
        reason: `Subscription paid for child (${sub.plan})`,
        recordedBy,
      });
    } else {
      await walletDebit(tx, sub.studentId, sub.price, {
        type: "payment",
        method: "wallet",
        subscriptionId: sub.id,
        reason: `Subscription payment (${sub.plan})`,
        recordedBy,
      });
    }
  }

  let receiptNumber: string;
  if (sub.centerId) {
    const center = await tx.center.update({
      where: { id: sub.centerId },
      data: { receiptSeq: { increment: 1 } },
    });
    receiptNumber = formatCenterReceipt(center.shortId, center.receiptSeq);
  } else {
    receiptNumber = await nextPlatformReceipt(tx);
  }

  const payment = await tx.payment.create({
    data: {
      centerId: sub.centerId,
      studentId: sub.studentId,
      payerUserId,
      courseId: sub.courseId,
      amount: sub.price,
      paymentMethod: method,
      note: `Subscription (${sub.plan}, ${
        method === "cash" ? "cash" : isCounterMethod(method) ? method : "online"
      }${
        payerUserId ? ", paid by parent" : ""
      })`,
      receiptNumber,
      recordedBy,
      shiftId: await openShiftIdFor(tx, recordedBy),
      paidAt: new Date(),
      dataSource: sub.dataSource,
    },
  });

  if (sub.centerId) {
    const refNumber = await nextTxnRef(tx);
    await tx.transaction.create({
      data: {
        refNumber,
        type: "payment",
        amount: sub.price,
        fromEntityId: sub.studentId,
        toEntityId: sub.centerId,
        centerId: sub.centerId,
        status: "completed",
        paymentMethod: method,
        funding: fundingOfMethod(method),
        gatewayRef,
        notes: `Subscription payment (${sub.plan}, subscription ${sub.id})`,
        dataSource: sub.dataSource,
      },
    });
  } else {
    const rate = await resolveCommission(tx, { teacherId: sub.teacherId });
    const { teacherNet, platformCommission } = computeTeacherDirectSplit(
      sub.price,
      rate.teacherDirectCommissionBp,
    );
    const [payRef, feeRef] = [await nextTxnRef(tx), await nextTxnRef(tx)];
    await tx.transaction.createMany({
      data: [
        {
          refNumber: payRef,
          type: "payment",
          amount: sub.price,
          fromEntityId: sub.studentId,
          toEntityId: sub.teacherId,
          centerId: null,
          status: "completed",
          paymentMethod: method,
          funding: fundingOfMethod(method),
          gatewayRef,
          notes: `Teacher-direct subscription payment (subscription ${sub.id})`,
          dataSource: sub.dataSource,
        },
        {
          refNumber: feeRef,
          type: "commission",
          amount: platformCommission,
          fromEntityId: sub.teacherId,
          toEntityId: null,
          centerId: null,
          status: "completed",
          notes: `Platform commission ${rate.teacherDirectCommissionBp / 100}% (${rate.source} setting) — subscription ${sub.id}`,
          dataSource: sub.dataSource,
        },
      ],
    });
    await tx.teacherProfile.updateMany({
      where: { userId: sub.teacherId },
      data: { walletBalance: { increment: teacherNet } },
    });
  }

  await awardPoints(tx, sub.studentId, isCounterMethod(method) ? "cash_payment" : "online_payment", {
    reason:
      method === "cash"
        ? "Subscription paid (cash)" // byte-identical to before Phase 1
        : isCounterMethod(method)
          ? `Subscription paid at the counter (${method})`
          : "Subscription paid (online)",
  });

  return { paymentId: payment.id, receiptNumber };
}

export type InitiateSubscriptionIntent = (
  sub: Subscription,
  method: "card" | "wallet",
  idempotencyKey: string,
  user: SessionUser,
) => Promise<unknown>;

async function resolveCheckoutActor(
  studentIdInput: string | undefined,
  user: SessionUser,
): Promise<{ studentId: string; payerUserId: string | null }> {
  if (user.role === "student") {
    if (studentIdInput && studentIdInput !== user.id) {
      throw new ForbiddenError("A student can only subscribe for themselves");
    }
    return { studentId: user.id, payerUserId: null };
  }

  if (user.role === "parent") {
    if (!studentIdInput) {
      throw new BusinessRuleError("studentId is required — choose which child");
    }
    await platformDb((tx) => assertApprovedChild(tx, user.id, studentIdInput));
    return { studentId: studentIdInput, payerUserId: user.id };
  }

  throw new ForbiddenError("Students and parents only");
}

export async function createSubscriptionCheckout(
  input: {
    courseId: string;
    studentId?: string;
    plan: "monthly" | "per_session";
    sessionId?: string;
    method: "card" | "wallet"; // Paymob sub-method (card iframe vs mobile wallets) — gateway path only
    payFrom?: "gateway" | "wallet" | "parent_wallet";
    idempotencyKey: string;
  },
  user: SessionUser,
  initiateIntent: InitiateSubscriptionIntent,
) {
  const { studentId, payerUserId } = await resolveCheckoutActor(input.studentId, user);
  const choice: PlanChoice = { plan: input.plan, sessionId: input.sessionId ?? null };
  const payFrom = input.payFrom ?? "gateway";

  if (payFrom === "wallet" && user.role !== "student") {
    throw new ForbiddenError("Only a student can pay from their own wallet balance");
  }
  if (payFrom === "parent_wallet" && user.role !== "parent") {
    throw new ForbiddenError("Only a parent can pay from a parent wallet");
  }

  if (payFrom === "wallet" || payFrom === "parent_wallet") {
    const course0 = await platformDb((tx) =>
      tx.course.findFirst({
        where: { id: input.courseId, status: "active" },
        select: { id: true, centerId: true, teacherId: true },
      }),
    );
    if (!course0) throw new NotFoundError("Course not found or not active");
    await assertNotBlacklisted(studentId, course0.centerId, course0.teacherId);

    const settled = await platformDb(
      async (tx) => {
        if (payerUserId) {
          await tx.$queryRaw`SELECT 1 FROM parent_profiles WHERE user_id = ${payerUserId}::uuid FOR UPDATE`;
        } else {
          await tx.$queryRaw`SELECT 1 FROM student_profiles WHERE user_id = ${studentId}::uuid FOR UPDATE`;
        }
        const course = await tx.course.findFirst({
          where: { id: input.courseId, status: "active" },
        });
        if (!course) throw new NotFoundError("Course not found or not active");
        const { price } = await resolvePlan(tx, course, choice);
        await assertNoDuplicateActive(tx, studentId, course.id, choice);

        const sub = await tx.subscription.create({
          data: subscriptionShell(
            course,
            studentId,
            choice,
            price,
            "online",
            payerUserId ?? undefined,
          ),
        });
        const { paymentId, receiptNumber } = await settleSubscriptionMoney(
          tx,
          sub,
          "wallet",
          null,
          user.id,
          payerUserId,
        );
        const active = await activateSubscription(tx, sub.id, {
          paymentMethod: "wallet",
          paymentId,
          enrolledBy: user.id,
        });
        return { subscriptionId: active.id, receiptNumber, status: active.status };
      },
      { actorId: user.id },
    );

    await notify({
      recipients: await studentAndParents(studentId),
      type: "payment_recorded",
      title: "Subscription active",
      body: payerUserId
        ? `A parent paid for this subscription from their wallet. Receipt ${settled.receiptNumber}.`
        : `Your subscription is active (paid from wallet). Receipt ${settled.receiptNumber}.`,
      data: { subscriptionId: settled.subscriptionId, receiptNumber: settled.receiptNumber },
    });
    void sendPaymentReceiptEmail(settled.receiptNumber, "wallet");
    void trackFirstPayment(settled.receiptNumber, "wallet");
    return { walletPaid: true, ...settled };
  }

  // SECURITY_AUDIT.md (2026-09-11) BIZ-08: refuse a blacklisted student BEFORE
  // the pending subscription row is written, not after it has committed.
  // `assertNotBlacklisted` runs its own transaction, so it stays outside this one.
  {
    const course0 = await platformDb((tx) =>
      tx.course.findFirst({
        where: { id: input.courseId, status: "active" },
        select: { centerId: true, teacherId: true },
      }),
    );
    if (course0) await assertNotBlacklisted(studentId, course0.centerId, course0.teacherId);
  }

  const { sub, course } = await platformDb(
    async (tx) => {
      // L-10: the idempotency key is consulted FIRST. A retry of the same
      // request used to mint a fresh `pending_payment` row before the intent
      // lookup returned the first intent — one orphan subscription per retry.
      const existing = await tx.paymentIntent.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { subscriptionId: true, studentId: true, payerUserId: true },
      });
      if (existing) {
        if ((existing.payerUserId ?? existing.studentId) !== user.id) {
          throw new ForbiddenError("Idempotency key belongs to another user");
        }
        const prior = existing.subscriptionId
          ? await tx.subscription.findUnique({ where: { id: existing.subscriptionId } })
          : null;
        if (!prior) throw new BusinessRuleError("Idempotency key belongs to a different checkout");
        const course = await tx.course.findUniqueOrThrow({ where: { id: prior.courseId } });
        return { sub: prior, course };
      }

      // M-02: serialise checkouts per student, exactly as the wallet branch
      // does. Two requests with different keys used to pass
      // `assertNoDuplicateActive` together (both subscriptions were still
      // `pending_payment`), get two intents, and both got paid.
      await tx.$queryRaw`SELECT 1 FROM student_profiles WHERE user_id = ${studentId}::uuid FOR UPDATE`;

      const course = await tx.course.findFirst({
        where: { id: input.courseId, status: "active" },
      });
      if (!course) throw new NotFoundError("Course not found or not active");

      const { price } = await resolvePlan(tx, course, choice);
      await assertNoDuplicateActive(tx, studentId, course.id, choice);
      await assertNoCheckoutInFlight(tx, studentId, course.id, choice);

      const sub = await tx.subscription.create({
        data: subscriptionShell(
          course,
          studentId,
          choice,
          price,
          "online",
          payerUserId ?? undefined,
        ),
      });
      return { sub, course };
    },
    { actorId: user.id },
  );

  return initiateIntent(sub, input.method, input.idempotencyKey, user);
}

/**
 * M-02, checkout side. A `pending_payment` subscription for the same plan whose
 * intent is still `pending` and unexpired is a checkout the student can still
 * complete; starting a second one is how two captures for one plan happen. The
 * abandoned-iframe case is not a lockout: the intent expires in an hour, and
 * the payer can cancel the pending subscription at any time.
 */
const INTENT_ATTACH_GRACE_MS = 10 * 60 * 1000;

async function assertNoCheckoutInFlight(
  tx: TenantTx,
  studentId: string,
  courseId: string,
  choice: PlanChoice,
): Promise<void> {
  const pending = await tx.subscription.findMany({
    where:
      choice.plan === "monthly"
        ? { studentId, courseId, plan: "monthly", status: "pending_payment" }
        : { studentId, sessionId: choice.sessionId, plan: "per_session", status: "pending_payment" },
    select: { paymentIntentId: true, createdAt: true },
  });
  if (pending.length === 0) return;

  const now = Date.now();
  // The intent is minted in a LATER transaction than the subscription row, so
  // a sibling that committed a moment ago has no intent yet. A young row with
  // no intent is in flight; an old one with no intent is a checkout whose
  // initiation failed, and is not allowed to block forever.
  const attaching = pending.some(
    (p) => !p.paymentIntentId && now - p.createdAt.getTime() < INTENT_ATTACH_GRACE_MS,
  );
  const withIntent = pending.map((p) => p.paymentIntentId).filter(Boolean) as string[];
  const live =
    withIntent.length === 0
      ? null
      : await tx.paymentIntent.findFirst({
          where: { id: { in: withIntent }, status: "pending", expiresAt: { gt: new Date(now) } },
          select: { id: true },
        });
  if (attaching || live) {
    throw new BusinessRuleError(
      "A checkout for this course is already in progress — finish it or cancel it first",
    );
  }
}

/**
 * Settle a gateway capture against its subscription (SECURITY_AUDIT.md H-03).
 *
 * This used to `return null` for any subscription that was no longer
 * `pending_payment` — after the caller had already flipped the intent to
 * `paid` in the same transaction. The provider had the money; the platform had
 * a `paid` intent, no `payments` row, no ledger row, no wallet credit and no
 * notification. Every such case was a customer who paid and got nothing, and a
 * ledger that could not see it.
 *
 * Now a capture ALWAYS ends in a money row, one of three ways:
 *   1. the subscription is `pending_payment` → activate it (the ordinary path);
 *   2. it is `cancelled` (the payer changed their mind, or the 24 h sweep ran)
 *      but the course is still active and nothing else covers the same plan →
 *      RE-ACTIVATE it: they paid for coverage, give them coverage;
 *   3. anything else (expired, superseded by a sibling checkout that won the
 *      race, course closed, session gone) → CREDIT THE PAYER'S WALLET — the
 *      parent's if a parent paid, else the student's — with a receipt the
 *      family can see and a row finance can reconcile.
 *
 * The student profile row is locked first so two captures for the same
 * student serialise here: the second one sees the first's active subscription
 * and takes branch 3 instead of racing `subs_one_active_*` into a P2002 that
 * would roll the whole claim back (Phase 3 §3.2/1). The caller then asserts
 * `payment_intents.payment_id` is set, which is what makes "settled but wrote
 * nothing" impossible rather than merely unlikely.
 */
export async function settleSubscriptionFromIntentTx(
  tx: TenantTx,
  subscriptionId: string,
  intent: { id: string; gatewayRef: string | null; payerUserId?: string | null },
): Promise<SettleNotification> {
  const sub0 = await tx.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub0) throw new NotFoundError("Subscription vanished during settlement");

  await tx.$queryRaw`SELECT 1 FROM student_profiles WHERE user_id = ${sub0.studentId}::uuid FOR UPDATE`;
  const sub = await tx.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });

  const payerUserId = intent.payerUserId ?? null;
  const actor = payerUserId ?? sub.studentId;

  const activate = async (reactivated: boolean): Promise<SettleNotification> => {
    const { paymentId, receiptNumber } = await settleSubscriptionMoney(
      tx,
      sub,
      "online_paymob",
      intent.gatewayRef,
      actor,
      payerUserId,
    );
    await tx.subscription.update({
      where: { id: sub.id },
      data: { paymentIntentId: intent.id, cancelledAt: reactivated ? null : undefined },
    });
    await activateSubscription(tx, sub.id, {
      paymentMethod: "online_paymob",
      paymentId,
      enrolledBy: actor,
    });
    await tx.paymentIntent.update({ where: { id: intent.id }, data: { paymentId } });
    if (reactivated) {
      await tx.auditLog.create({
        data: {
          actorId: null,
          action: "subscription.reactivated_by_capture",
          targetType: "subscription",
          targetId: sub.id,
          centerId: sub.centerId,
          beforeState: { status: sub.status, cancelledAt: sub.cancelledAt },
          afterState: { status: "active", paymentIntentId: intent.id, paymentId, receiptNumber },
        },
      });
    }
    return {
      studentId: sub.studentId,
      type: "payment_recorded",
      title: "Subscription active",
      body: payerUserId
        ? `A parent paid for this subscription. Receipt ${receiptNumber}.`
        : `Your subscription is active. Receipt ${receiptNumber}.`,
      data: { subscriptionId: sub.id, receiptNumber, reactivated },
    };
  };

  // Under the lock, "may this capture grant coverage?" is answered once for
  // both live statuses. A pending subscription whose plan is ALREADY covered
  // (a sibling checkout won the race — Phase 3 §3.2/1) must not race the
  // `subs_one_active_*` index into a P2002 that aborts the transaction; it
  // takes the credit branch instead. A cancelled one additionally needs its
  // course, and for a pass its session, to still be sellable.
  const duplicate = await (async () => {
    try {
      await assertNoDuplicateActive(tx, sub.studentId, sub.courseId, {
        plan: sub.plan,
        sessionId: sub.sessionId,
      });
      return false;
    } catch (err) {
      if (err instanceof BusinessRuleError) return true;
      throw err;
    }
  })();

  if (sub.status === "pending_payment" && !duplicate) return activate(false);

  if (sub.status === "cancelled" && !duplicate) {
    const course = await tx.course.findUnique({
      where: { id: sub.courseId },
      select: { status: true },
    });
    let sellable = course?.status === "active";
    if (sellable && sub.plan === "per_session") {
      const session = sub.sessionId
        ? await tx.session.findUnique({ where: { id: sub.sessionId } })
        : null;
      sellable =
        !!session &&
        session.status !== "cancelled" &&
        session.status !== "completed" &&
        !session.distributedAt;
    }
    if (sellable) return activate(true);
  }

  return creditOrphanedCapture(tx, sub, intent, payerUserId, actor);
}

/**
 * Branch 3 above. The money is real and the coverage it bought cannot be
 * granted, so it becomes spendable balance for whoever paid — the same shape
 * as an online wallet top-up (platform-held float, `toEntityId: null`), so
 * every report that already understands top-ups understands this row too.
 */
async function creditOrphanedCapture(
  tx: TenantTx,
  sub: Subscription,
  intent: { id: string; gatewayRef: string | null },
  payerUserId: string | null,
  actor: string,
): Promise<SettleNotification> {
  const target = await resolvePayerTarget(tx, { studentId: sub.studentId, payerUserId });

  let receiptNumber: string;
  if (sub.centerId) {
    const center = await tx.center.update({
      where: { id: sub.centerId },
      data: { receiptSeq: { increment: 1 } },
    });
    receiptNumber = formatCenterReceipt(center.shortId, center.receiptSeq);
  } else {
    receiptNumber = await nextPlatformReceipt(tx);
  }

  const payment = await tx.payment.create({
    data: {
      centerId: sub.centerId,
      studentId: sub.studentId,
      payerUserId,
      courseId: sub.courseId,
      amount: sub.price,
      paymentMethod: "online_paymob",
      note: `Payment captured after the subscription was ${sub.status} — credited to the ${target.kind} wallet`,
      receiptNumber,
      recordedBy: actor,
      paidAt: new Date(),
      dataSource: sub.dataSource,
    },
  });

  const refNumber = await nextTxnRef(tx);
  const transaction = await tx.transaction.create({
    data: {
      refNumber,
      type: "payment",
      amount: sub.price,
      fromEntityId: sub.studentId,
      toEntityId: null, // platform-held float, exactly like an online top-up
      centerId: null,
      status: "completed",
      paymentMethod: "online_paymob",
      funding: "platform_held",
      gatewayRef: intent.gatewayRef,
      notes: `Orphaned capture credited to ${target.kind} wallet (intent ${intent.id}, subscription ${sub.id} ${sub.status})`,
      dataSource: sub.dataSource,
    },
  });

  const { balanceAfter } = await creditRefundTarget(tx, target, sub.price, {
    type: "adjustment",
    method: "online_paymob",
    refNumber,
    paymentId: payment.id,
    paymentIntentId: intent.id,
    subscriptionId: sub.id,
    relatedTxnId: transaction.id,
    reason: `Payment captured after the subscription was ${sub.status}; credited instead of lost`,
    recordedBy: actor,
  });

  await tx.paymentIntent.update({
    where: { id: intent.id },
    data: { paymentId: payment.id, transactionId: transaction.id },
  });

  await tx.auditLog.create({
    data: {
      actorId: null,
      action: "payment.orphan_capture_credited",
      targetType: "payment_intent",
      targetId: intent.id,
      centerId: sub.centerId,
      beforeState: { subscriptionId: sub.id, subscriptionStatus: sub.status },
      afterState: {
        paymentId: payment.id,
        receiptNumber,
        amount: sub.price,
        creditedTo: target.kind,
        creditedUserId: target.userId,
        balanceAfter,
      },
    },
  });

  const family = await studentAndParents(sub.studentId);
  const finance = await resolveFinanceStaff();
  return {
    studentId: sub.studentId,
    recipients: [...new Set([...family, target.userId, ...finance])],
    type: "payment_recorded",
    title: "Payment credited to wallet",
    body: `Your payment was received after the subscription was ${sub.status}, so ${(sub.price / 100).toFixed(2)} EGP was added to the ${target.kind === "parent" ? "parent" : "student"} wallet instead. Receipt ${receiptNumber}.`,
    data: {
      subscriptionId: sub.id,
      receiptNumber,
      paymentId: payment.id,
      walletCredit: sub.price,
      creditedTo: target.kind,
      orphanedCapture: true,
    },
  };
}

export async function createWalkInSubscription(
  input: {
    studentId: string;
    courseId: string;
    plan: "monthly" | "per_session";
    sessionId?: string;
    markAttendance?: boolean;
    paymentMethod?: CounterMethod;
  },
  user: SessionUser,
) {
  const method: CounterMethod = input.paymentMethod ?? "cash";
  if (user.role !== "center_admin" || !user.centerId) throw new ForbiddenError();

  await assertNotBlacklisted(input.studentId, user.centerId);

  const { value, effects } = await scopedDb(user, (tx) =>
    createWalkInSubscriptionTx(tx, input, user),
  );
  await runEffects(effects);
  return value;
}

export async function createWalkInSubscriptionTx(
  tx: TenantTx,
  input: {
    studentId: string;
    courseId: string;
    plan: "monthly" | "per_session";
    sessionId?: string;
    markAttendance?: boolean;
    paymentMethod?: CounterMethod;
  },
  user: SessionUser,
) {
  const method: CounterMethod = input.paymentMethod ?? "cash";
  if (user.role !== "center_admin" || !user.centerId) throw new ForbiddenError();

  // The blacklist check is the CALLER's job, before it opens `tx`.
  // `assertNotBlacklisted` runs in its own platform-context transaction (a
  // tenant-scoped one cannot see platform-level entries under RLS), so calling it
  // from in here holds one pool connection while waiting for a second. With N
  // connections, N concurrent cash payments then wait on each other until
  // maxWait expires: measured 2026-09-20, 90 concurrent requests on a pool of 10
  // -> 0 accepted, 450 x P2028, every request 31-60 s
  // (docs/reports/load-test-2026-09-20.md).

  const { sub, receiptNumber } = await (async () => {
    const course = await tx.course.findFirst({
      where: { id: input.courseId, status: "active" },
    });
    if (!course) throw new NotFoundError("Course not found at this center");

    const choice: PlanChoice = { plan: input.plan, sessionId: input.sessionId ?? null };
    const { price, session } = await resolvePlan(tx, course, choice);
    await assertNoDuplicateActive(tx, input.studentId, course.id, choice);

    const roster = await tx.centerStudentRoster.findFirst({
      where: { centerId: course.centerId as string, studentId: input.studentId, leftAt: null },
    });
    if (!roster) {
      await tx.centerStudentRoster.create({
        data: { centerId: course.centerId as string, studentId: input.studentId },
      });
    }

    const created = await tx.subscription.create({
      data: subscriptionShell(course, input.studentId, choice, price, "walk_in", user.id),
    });

    const { paymentId, receiptNumber } = await settleSubscriptionMoney(
      tx,
      created,
      method,
      null,
      user.id,
    );
    const sub = await activateSubscription(tx, created.id, {
      paymentMethod: method,
      paymentId,
      enrolledBy: user.id,
    });

    if (input.markAttendance && choice.plan === "per_session" && session) {
      // SECURITY_AUDIT.md (2026-09-11) BIZ-06: decision #4 — in
      // `counter_and_door` mode a counter check-in is `counter_only` and does
      // NOT count as present until the door scan; this shortcut wrote
      // `present` regardless, and settlement counted it.
      const teacherMode = await tx.teacherProfile.findUnique({
        where: { userId: course.teacherId },
        select: { attendanceMode: true },
      });
      const status = teacherMode?.attendanceMode === "counter_and_door" ? "counter_only" : "present";
      await tx.attendanceRecord.upsert({
        where: {
          sessionId_studentId: { sessionId: session.id, studentId: input.studentId },
        },
        create: {
          sessionId: session.id,
          studentId: input.studentId,
          courseId: course.id,
          centerId: course.centerId,
          status,
          markedBy: user.id,
          dataSource: course.dataSource,
        },
        update: { status, markedBy: user.id, editedAt: new Date() },
      });
    }

    return { sub, receiptNumber };
  })();

  return {
    value: { ...sub, receiptNumber },
    effects: [
      async () => {
        await notify({
          recipients: await studentAndParents(input.studentId),
          type: "payment_recorded",
          title: "Subscription active",
          body: `Your subscription was recorded at the center. Receipt ${receiptNumber}.`,
          data: { subscriptionId: sub.id, receiptNumber },
        });
      },
    ],
  };
}

export { coveredStudentIds } from "../../services/subscriptions/coverage";

export async function listMySubscriptions(
  user: SessionUser,
  opts?: { studentId?: string },
) {
  let studentId = user.id;
  if (user.role === "parent") {
    if (!opts?.studentId) {
      throw new BusinessRuleError("studentId is required — choose which child");
    }
    const childId = opts.studentId;
    await platformDb((tx) => assertApprovedChild(tx, user.id, childId));
    studentId = childId;
  } else if (opts?.studentId && opts.studentId !== user.id) {
    throw new ForbiddenError("A student can only list their own subscriptions");
  }

  return platformDb(async (tx) => {
    const subs = await tx.subscription.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const courseIds = [...new Set(subs.map((s) => s.courseId))];
    const courses = await tx.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, title: true, location: true },
    });
    const courseMap = new Map(courses.map((c) => [c.id, c]));
    return subs.map((s) => ({ ...s, course: courseMap.get(s.courseId) ?? null }));
  });
}

export async function cancelPendingSubscription(subscriptionId: string, user: SessionUser) {
  return platformDb(
    async (tx) => {
      const sub = await tx.subscription.findUnique({ where: { id: subscriptionId } });
      if (!sub) throw new NotFoundError("Subscription not found");
      const owns =
        sub.studentId === user.id ||
        (user.role === "parent" && sub.createdBy === user.id);
      if (!owns) throw new ForbiddenError();
      if (sub.status !== "pending_payment") {
        throw new BusinessRuleError("Only unpaid subscriptions can be cancelled here");
      }
      // The intent is deliberately left alone (H-03): the provider, not this
      // button, decides whether money moved. A capture that still arrives for a
      // cancelled subscription is re-activated or credited by
      // settleSubscriptionFromIntentTx — never dropped.
      return tx.subscription.update({
        where: { id: sub.id },
        data: { status: "cancelled", cancelledAt: new Date() },
      });
    },
    { actorId: user.id },
  );
}

export async function expireSubscriptions(now: Date) {
  return platformDb(async (tx) => {
    const monthly = await tx.subscription.updateMany({
      where: { status: "active", plan: "monthly", periodEnd: { lt: now } },
      data: { status: "expired" },
    });

    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    // L-09 (SECURITY_AUDIT.md): paginate — a flat `take: 2000` left every pass
    // beyond the cap un-expired forever.
    let passesExpired = 0;
    let passCursor: string | undefined;
    for (;;) {
      const passes = await tx.subscription.findMany({
        where: { status: "active", plan: "per_session", ...(passCursor ? { id: { gt: passCursor } } : {}) },
        select: { id: true, sessionId: true },
        orderBy: { id: "asc" },
        take: 2000,
      });
      if (passes.length === 0) break;
      passCursor = passes[passes.length - 1]!.id;
      const sessionIds = [...new Set(passes.map((p) => p.sessionId).filter(Boolean) as string[])];
      const sessions = await tx.session.findMany({
        where: { id: { in: sessionIds }, date: { lt: dayStart } },
        select: { id: true },
      });
      const overIds = new Set(sessions.map((s) => s.id));
      const passIds = passes.filter((p) => p.sessionId && overIds.has(p.sessionId)).map((p) => p.id);
      if (passIds.length) {
        const res = await tx.subscription.updateMany({
          where: { id: { in: passIds } },
          data: { status: "expired" },
        });
        passesExpired += res.count;
      }
      if (passes.length < 2000) break;
    }
    const perSession = { count: passesExpired };

    // H-03 rule 4: only a pending subscription whose intent is NOT payable is
    // stale. One whose intent is still `pending` and unexpired may be captured
    // any second; cancelling it here is what used to turn that capture into an
    // orphan. Subscription → intent is a bare column, so the filter is in JS.
    let stalePendingCancelled = 0;
    let cursor: string | undefined;
    for (;;) {
      const batch = await tx.subscription.findMany({
        where: {
          status: "pending_payment",
          createdAt: { lt: new Date(now.getTime() - PENDING_TTL_MS) },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        select: { id: true, paymentIntentId: true },
        orderBy: { id: "asc" },
        take: 500,
      });
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1]!.id;

      const intentIds = batch.map((b) => b.paymentIntentId).filter(Boolean) as string[];
      const live = new Set(
        (
          await tx.paymentIntent.findMany({
            where: { id: { in: intentIds }, status: "pending", expiresAt: { gt: now } },
            select: { id: true },
          })
        ).map((i) => i.id),
      );
      const staleIds = batch
        .filter((b) => !b.paymentIntentId || !live.has(b.paymentIntentId))
        .map((b) => b.id);
      if (staleIds.length > 0) {
        const res = await tx.subscription.updateMany({
          where: { id: { in: staleIds }, status: "pending_payment" },
          data: { status: "cancelled", cancelledAt: now },
        });
        stalePendingCancelled += res.count;
      }
      if (batch.length < 500) break;
    }

    return {
      monthlyExpired: monthly.count,
      passesExpired: perSession.count,
      stalePendingCancelled,
    };
  });
}
