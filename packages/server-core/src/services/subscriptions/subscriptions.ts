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
import { awardPoints } from "../../services/points/points";
import { nextTxnRef } from "../../services/finance/ref-numbers";
import { computeTeacherDirectSplit } from "../../services/finance/fees";
import { resolveCommission } from "../../services/finance/commission";
import { assertNotBlacklisted } from "../../services/blacklist/blacklist";
import { walletDebit } from "../../services/wallet/wallet";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000; // monthly coverage window
const PENDING_TTL_MS = 24 * 60 * 60 * 1000; // stale pending_payment sweep

// ---------------------------------------------------------------------------
// Plan validation + subscription shell creation (shared by online + walk-in)
// ---------------------------------------------------------------------------

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
  const session = await tx.session.findUnique({ where: { id: choice.sessionId } });
  if (!session || session.courseId !== course.id) {
    throw new NotFoundError("Session not found on this course");
  }
  if (session.status === "cancelled" || session.status === "completed") {
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

// ---------------------------------------------------------------------------
// Activation (shared): coverage window + the wrapped enrollment
// ---------------------------------------------------------------------------

async function activateSubscription(
  tx: TenantTx,
  subscriptionId: string,
  opts: {
    paymentMethod: "cash" | "online_paymob" | "wallet";
    paymentId?: string | null;
    enrolledBy: string;
  },
): Promise<Subscription> {
  const sub = await tx.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) throw new NotFoundError("Subscription not found");

  // Wrapped enrollment: reuse an active one, else create it. The enrollment
  // stays the roster link; the subscription is the payment coverage on top.
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

// ---------------------------------------------------------------------------
// Settlement money movements (called with the pending->paid claim held)
// ---------------------------------------------------------------------------

function formatCenterReceipt(shortId: string, seq: number): string {
  return `RCP-${shortId}-${new Date().getFullYear()}-${String(seq).padStart(5, "0")}`;
}

async function nextPlatformReceipt(tx: TenantTx): Promise<string> {
  const rows = await tx.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('platform_receipt_seq'::regclass)`;
  return `RCP-EDURA-${new Date().getFullYear()}-${String(Number(rows[0].nextval)).padStart(5, "0")}`;
}

/**
 * Money side of a PAID subscription. Two branches:
 *
 * - CENTER course: Payment (center receipt seq) + ledger Transaction
 *   student->center. Teacher/center/platform splits still happen at session
 *   completion via distributeSessionRevenue (unchanged engine).
 *
 * - TEACHER-DIRECT course (centerId NULL): the split happens HERE, at payment
 *   time — platform commission only, at the rate resolved from
 *   commission_settings (global default, future per-teacher/center overrides),
 *   remainder straight to the teacher wallet.
 *   distributeSessionRevenue skips these courses ("teacher_direct_settled_at_
 *   payment"), which is the double-pay guard.
 */
async function settleSubscriptionMoney(
  tx: TenantTx,
  sub: Subscription,
  method: "cash" | "online_paymob" | "wallet",
  gatewayRef: string | null,
  recordedBy: string,
): Promise<{ paymentId: string; receiptNumber: string }> {
  // WALLET funding source: debit the student's balance ALL-OR-NOTHING before any
  // Payment row exists. walletDebit uses the H2 conditional decrement — an
  // insufficient balance throws here, rolling back the whole enclosing tx
  // (nothing charged, no receipt, no partial debit). Money still LANDS where it
  // does for cash/online below (student->center or student->teacher); the wallet
  // is only the funding leg, recorded on the Transaction as paymentMethod=wallet.
  if (method === "wallet") {
    await walletDebit(tx, sub.studentId, sub.price, {
      type: "payment",
      method: "wallet",
      subscriptionId: sub.id,
      reason: `Subscription payment (${sub.plan})`,
      recordedBy,
    });
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
      courseId: sub.courseId,
      amount: sub.price,
      note: `Subscription (${sub.plan}, ${method === "cash" ? "cash" : "online"})`,
      receiptNumber,
      recordedBy,
      paidAt: new Date(),
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
        gatewayRef,
        notes: `Subscription payment (${sub.plan}, subscription ${sub.id})`,
      },
    });
  } else {
    // Teacher-direct: pay the teacher NOW (minus the platform commission
    // resolved from commission_settings at charge time).
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
          gatewayRef,
          notes: `Teacher-direct subscription payment (subscription ${sub.id})`,
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
        },
      ],
    });
    await tx.teacherProfile.updateMany({
      where: { userId: sub.teacherId },
      data: { walletBalance: { increment: teacherNet } },
    });
  }

  await awardPoints(tx, sub.studentId, "online_payment", {
    reason: method === "cash" ? "Subscription paid (cash)" : "Subscription paid (online)",
  });

  return { paymentId: payment.id, receiptNumber };
}

// ---------------------------------------------------------------------------
// Online checkout (student)
// ---------------------------------------------------------------------------

/**
 * How the caller starts a gateway payment for a freshly created subscription.
 * apps/www passes `initiateSubscriptionIntent`; nothing else may.
 */
export type InitiateSubscriptionIntent = (
  sub: Subscription,
  method: "card" | "wallet",
  idempotencyKey: string,
  user: SessionUser,
) => Promise<unknown>;

export async function createSubscriptionCheckout(
  input: {
    courseId: string;
    plan: "monthly" | "per_session";
    sessionId?: string;
    method: "card" | "wallet"; // Paymob sub-method (card iframe vs mobile wallets) — gateway path only
    payFrom?: "gateway" | "wallet"; // funding source: gateway OR the student's own wallet balance
    idempotencyKey: string;
  },
  user: SessionUser,
  initiateIntent: InitiateSubscriptionIntent,
) {
  if (user.role !== "student") throw new ForbiddenError("Students only");
  const choice: PlanChoice = { plan: input.plan, sessionId: input.sessionId ?? null };

  // ---- Pay from the student's own WALLET: settle synchronously, no gateway ----
  if ((input.payFrom ?? "gateway") === "wallet") {
    const course0 = await platformDb((tx) =>
      tx.course.findFirst({
        where: { id: input.courseId, status: "active" },
        select: { id: true, centerId: true, teacherId: true },
      }),
    );
    if (!course0) throw new NotFoundError("Course not found or not active");
    await assertNotBlacklisted(user.id, course0.centerId, course0.teacherId);

    const settled = await platformDb(
      async (tx) => {
        // Serialize concurrent wallet checkouts for this student so two submits
        // can't both create-and-settle (double-charge). The FOR UPDATE lock +
        // assertNoDuplicateActive make the loser see the winner's active sub.
        await tx.$queryRaw`SELECT 1 FROM student_profiles WHERE user_id = ${user.id}::uuid FOR UPDATE`;
        const course = await tx.course.findFirst({
          where: { id: input.courseId, status: "active" },
        });
        if (!course) throw new NotFoundError("Course not found or not active");
        const { price } = await resolvePlan(tx, course, choice);
        await assertNoDuplicateActive(tx, user.id, course.id, choice);

        const sub = await tx.subscription.create({
          data: subscriptionShell(course, user.id, choice, price, "online"),
        });
        // Debits the wallet ALL-OR-NOTHING (throws + rolls back on insufficient).
        const { paymentId, receiptNumber } = await settleSubscriptionMoney(
          tx,
          sub,
          "wallet",
          null,
          user.id,
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
      recipients: await studentAndParents(user.id),
      type: "payment_recorded",
      title: "Subscription active",
      body: `Your subscription is active (paid from wallet). Receipt ${settled.receiptNumber}.`,
      data: { subscriptionId: settled.subscriptionId, receiptNumber: settled.receiptNumber },
    });
    return { walletPaid: true, ...settled };
  }

  // ---- Gateway path (Paymob / mock) — unchanged ----
  const { sub, course } = await platformDb(
    async (tx) => {
      const course = await tx.course.findFirst({
        where: { id: input.courseId, status: "active" },
      });
      if (!course) throw new NotFoundError("Course not found or not active");

      const { price } = await resolvePlan(tx, course, choice);
      await assertNoDuplicateActive(tx, user.id, course.id, choice);

      const sub = await tx.subscription.create({
        data: subscriptionShell(course, user.id, choice, price, "online"),
      });
      return { sub, course };
    },
    { actorId: user.id },
  );

  await assertNotBlacklisted(user.id, course.centerId, course.teacherId);

  // Reuse the Step 3 payment machinery: the intent's amount is the
  // subscription's server-side price snapshot.
  //
  // INJECTED rather than imported. The Paymob gateway — its drivers, its HMAC
  // verification, and the C1 fail-closed env checks — stays in apps/www, which
  // owns the webhook. Passing the initiator in keeps the subscription logic
  // here in one place without pulling that machinery across, and it replaces a
  // dynamic import that only existed to dodge an import cycle.
  return initiateIntent(sub, input.method, input.idempotencyKey, user);
}

/**
 * Settle a subscription from its paid intent, WITHIN the caller's webhook claim
 * transaction (M1) — charge and activation are atomic. Returns the
 * notification to fire after commit, or null on a replay no-op. The
 * `status !== "pending_payment"` check is the subscription-side double-settle
 * guard (defense in depth alongside the intent claim).
 */
export async function settleSubscriptionFromIntentTx(
  tx: TenantTx,
  subscriptionId: string,
  intent: { id: string; gatewayRef: string | null },
): Promise<SettleNotification | null> {
  const sub = await tx.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) throw new NotFoundError("Subscription vanished during settlement");
  if (sub.status !== "pending_payment") return null; // replay no-op

  const { paymentId, receiptNumber } = await settleSubscriptionMoney(
    tx,
    sub,
    "online_paymob",
    intent.gatewayRef,
    sub.studentId,
  );
  await tx.subscription.update({
    where: { id: sub.id },
    data: { paymentIntentId: intent.id },
  });
  await activateSubscription(tx, sub.id, {
    paymentMethod: "online_paymob",
    paymentId,
    enrolledBy: sub.studentId,
  });
  return {
    studentId: sub.studentId,
    type: "payment_recorded",
    title: "Subscription active",
    body: `Your subscription is active. Receipt ${receiptNumber}.`,
    data: { subscriptionId: sub.id, receiptNumber },
  };
}

// ---------------------------------------------------------------------------
// Walk-in cash (center counter — the one-step workflow)
// ---------------------------------------------------------------------------

export async function createWalkInSubscription(
  input: {
    studentId: string;
    courseId: string;
    plan: "monthly" | "per_session";
    sessionId?: string;
    markAttendance?: boolean;
  },
  user: SessionUser,
) {
  if (user.role !== "center_admin" || !user.centerId) throw new ForbiddenError();

  await assertNotBlacklisted(input.studentId, user.centerId);

  const { sub, receiptNumber } = await scopedDb(user, async (tx) => {
    const course = await tx.course.findFirst({
      where: { id: input.courseId, status: "active" },
    });
    // Under withTenant, RLS already hides other centers' courses AND
    // teacher-direct courses (NULL center_id is bypass-only) — so a hit here
    // is guaranteed to be this center's own course.
    if (!course) throw new NotFoundError("Course not found at this center");

    const choice: PlanChoice = { plan: input.plan, sessionId: input.sessionId ?? null };
    const { price, session } = await resolvePlan(tx, course, choice);
    await assertNoDuplicateActive(tx, input.studentId, course.id, choice);

    // Walk-in students join the center roster if not on it yet (that IS the
    // walk-in registration semantics).
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
      "cash",
      null,
      user.id,
    );
    const sub = await activateSubscription(tx, created.id, {
      paymentMethod: "cash",
      paymentId,
      enrolledBy: user.id,
    });

    // Classic counter flow: cash for a single session + check-in in ONE step.
    // (This marks the roster attendance record; the staged counter/door
    // check-in modes are Step 6.)
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

// ---------------------------------------------------------------------------
// Coverage — what access/attendance checks consult
// ---------------------------------------------------------------------------

/**
 * Which of `studentIds` hold active coverage for this session: a per-session
 * pass for exactly this session, or a monthly subscription whose window
 * contains the session date.
 */
// Lives in the shared kernel (the attendance/check-in services moved there
// and need it, without the payment engine below); re-exported here.
export { coveredStudentIds } from "../../services/subscriptions/coverage";
// ---------------------------------------------------------------------------
// Student reads + cancel
// ---------------------------------------------------------------------------

export async function listMySubscriptions(user: SessionUser) {
  return platformDb(async (tx) => {
    const subs = await tx.subscription.findMany({
      where: { studentId: user.id },
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
      if (sub.studentId !== user.id) throw new ForbiddenError();
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

// ---------------------------------------------------------------------------
// Expiry (cron)
// ---------------------------------------------------------------------------

export async function expireSubscriptions(now: Date) {
  return platformDb(async (tx) => {
    const monthly = await tx.subscription.updateMany({
      where: { status: "active", plan: "monthly", periodEnd: { lt: now } },
      data: { status: "expired" },
    });

    // Per-session passes expire once their session's day is over.
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
