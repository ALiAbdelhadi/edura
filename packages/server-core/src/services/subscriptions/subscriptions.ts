import { platformDb, scopedDb, type TenantTx } from "../../db/scope";
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
import {
  parentWalletDebit,
  assertApprovedChild,
} from "../../services/wallet/parent-wallet";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000; // monthly coverage window
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
  return tx.subscription.update({
    where: { id: sub.id },
    data: {
      status: "active",
      activatedAt: now,
      paymentMethod: opts.paymentMethod,
      paymentId: opts.paymentId ?? undefined,
      enrollmentId: enrollment.id,
      periodStart: sub.plan === "monthly" ? now : null,
      periodEnd: sub.plan === "monthly" ? new Date(now.getTime() + MONTH_MS) : null,
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

  const { sub, course } = await platformDb(
    async (tx) => {
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
      return { sub, course };
    },
    { actorId: user.id },
  );

  await assertNotBlacklisted(studentId, course.centerId, course.teacherId);

  return initiateIntent(sub, input.method, input.idempotencyKey, user);
}

export async function settleSubscriptionFromIntentTx(
  tx: TenantTx,
  subscriptionId: string,
  intent: { id: string; gatewayRef: string | null; payerUserId?: string | null },
): Promise<SettleNotification | null> {
  const sub = await tx.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) throw new NotFoundError("Subscription vanished during settlement");
  if (sub.status !== "pending_payment") return null; // replay no-op

  const payerUserId = intent.payerUserId ?? null;
  const actor = payerUserId ?? sub.studentId;

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
    data: { paymentIntentId: intent.id },
  });
  await activateSubscription(tx, sub.id, {
    paymentMethod: "online_paymob",
    paymentId,
    enrolledBy: actor,
  });
  return {
    studentId: sub.studentId,
    type: "payment_recorded",
    title: "Subscription active",
    body: payerUserId
      ? `A parent paid for this subscription. Receipt ${receiptNumber}.`
      : `Your subscription is active. Receipt ${receiptNumber}.`,
    data: { subscriptionId: sub.id, receiptNumber },
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

  const { sub, receiptNumber } = await scopedDb(user, async (tx) => {
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
      await tx.attendanceRecord.upsert({
        where: {
          sessionId_studentId: { sessionId: session.id, studentId: input.studentId },
        },
        create: {
          sessionId: session.id,
          studentId: input.studentId,
          courseId: course.id,
          centerId: course.centerId,
          status: "present",
          markedBy: user.id,
          dataSource: course.dataSource,
        },
        update: { status: "present", markedBy: user.id, editedAt: new Date() },
      });
    }

    return { sub, receiptNumber };
  });

  await notify({
    recipients: await studentAndParents(input.studentId),
    type: "payment_recorded",
    title: "Subscription active",
    body: `Your subscription was recorded at the center. Receipt ${receiptNumber}.`,
    data: { subscriptionId: sub.id, receiptNumber },
  });

  return { ...sub, receiptNumber };
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
    const passes = await tx.subscription.findMany({
      where: { status: "active", plan: "per_session" },
      select: { id: true, sessionId: true },
      take: 2000,
    });
    const sessionIds = [...new Set(passes.map((p) => p.sessionId).filter(Boolean) as string[])];
    const sessions = await tx.session.findMany({
      where: { id: { in: sessionIds }, date: { lt: dayStart } },
      select: { id: true },
    });
    const overIds = new Set(sessions.map((s) => s.id));
    const passIds = passes.filter((p) => p.sessionId && overIds.has(p.sessionId)).map((p) => p.id);
    const perSession = passIds.length
      ? await tx.subscription.updateMany({
          where: { id: { in: passIds } },
          data: { status: "expired" },
        })
      : { count: 0 };

    const stalePending = await tx.subscription.updateMany({
      where: {
        status: "pending_payment",
        createdAt: { lt: new Date(now.getTime() - PENDING_TTL_MS) },
      },
      data: { status: "cancelled", cancelledAt: now },
    });

    return {
      monthlyExpired: monthly.count,
      passesExpired: perSession.count,
      stalePendingCancelled: stalePending.count,
    };
  });
}
