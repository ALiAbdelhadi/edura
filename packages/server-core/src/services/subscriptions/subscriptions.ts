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
import { walletDebit } from "../../services/wallet/wallet";
import {
  parentWalletDebit,
  assertApprovedChild,
} from "../../services/wallet/parent-wallet";

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
    // Provenance is INHERITED FROM THE GROUP, exactly like subjectId and
    // gradeLevelId above. Deriving it here rather than passing it in is what
    // makes it reliable: a payment for an off-system teacher's group is labelled
    // `manual` no matter which entry point took the money, and no caller has to
    // remember to say so. Costs nothing — `course` is already in hand.
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
 *
 * `payerUserId` names a PARENT paying for their own child. It changes exactly
 * two things — which wallet the funding leg debits, and the payer stamped on the
 * Payment row. It does NOT change where the money lands: a parent-funded
 * subscription still moves student -> center/teacher below, so every split,
 * statement, payout and distribution behaves identically to a self-funded one.
 */
async function settleSubscriptionMoney(
  tx: TenantTx,
  sub: Subscription,
  method: "cash" | "online_paymob" | "wallet",
  gatewayRef: string | null,
  recordedBy: string,
  payerUserId: string | null = null,
): Promise<{ paymentId: string; receiptNumber: string }> {
  // WALLET funding source: debit the payer's balance ALL-OR-NOTHING before any
  // Payment row exists. Both walletDebit and parentWalletDebit use the H2
  // conditional decrement — an insufficient balance throws here, rolling back
  // the whole enclosing tx (nothing charged, no receipt, no partial debit).
  // Money still LANDS where it does for cash/online below (student->center or
  // student->teacher); the wallet is only the funding leg, recorded on the
  // Transaction as paymentMethod=wallet.
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
      // NULL = the student paid for themselves. Set to the parent when a
      // guardian paid, so a receipt always names who actually handed over money.
      payerUserId,
      courseId: sub.courseId,
      amount: sub.price,
      note: `Subscription (${sub.plan}, ${method === "cash" ? "cash" : "online"}${
        payerUserId ? ", paid by parent" : ""
      })`,
      receiptNumber,
      recordedBy,
      paidAt: new Date(),
      // Carried from the subscription, which took it from the group. The whole
      // chain group -> subscription -> payment -> ledger therefore agrees by
      // construction rather than by three call sites remembering to match.
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
        gatewayRef,
        notes: `Subscription payment (${sub.plan}, subscription ${sub.id})`,
        dataSource: sub.dataSource,
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

/**
 * WHO is this subscription for, and WHO is paying.
 *
 * A student acts for themselves and pays for themselves — the original and
 * still the only shape the student paths produce. A PARENT acts for an
 * APPROVED child (approved-link gate, no exceptions) and pays as themselves.
 * Any other role is refused here, so the surface below never has to ask again.
 */
async function resolveCheckoutActor(
  studentIdInput: string | undefined,
  user: SessionUser,
): Promise<{ studentId: string; payerUserId: string | null }> {
  if (user.role === "student") {
    // A student may name themselves explicitly (the parent-shaped client sends
    // studentId either way), but never anybody else.
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
    /** The child this is for. Required for a parent; a student's own id or absent. */
    studentId?: string;
    plan: "monthly" | "per_session";
    sessionId?: string;
    method: "card" | "wallet"; // Paymob sub-method (card iframe vs mobile wallets) — gateway path only
    // Funding source: the gateway, the STUDENT's own balance, or the PARENT's.
    payFrom?: "gateway" | "wallet" | "parent_wallet";
    idempotencyKey: string;
  },
  user: SessionUser,
  initiateIntent: InitiateSubscriptionIntent,
) {
  const { studentId, payerUserId } = await resolveCheckoutActor(input.studentId, user);
  const choice: PlanChoice = { plan: input.plan, sessionId: input.sessionId ?? null };
  const payFrom = input.payFrom ?? "gateway";

  // Each wallet belongs to exactly one role, and neither may reach across.
  // A parent spending their CHILD's balance is not "paying for their child" —
  // it is spending the child's money — so it is refused, not silently accepted.
  if (payFrom === "wallet" && user.role !== "student") {
    throw new ForbiddenError("Only a student can pay from their own wallet balance");
  }
  if (payFrom === "parent_wallet" && user.role !== "parent") {
    throw new ForbiddenError("Only a parent can pay from a parent wallet");
  }

  // ---- Pay from a WALLET (the student's own, or the parent's): settle
  // ---- synchronously, no gateway.
  if (payFrom === "wallet" || payFrom === "parent_wallet") {
    const course0 = await platformDb((tx) =>
      tx.course.findFirst({
        where: { id: input.courseId, status: "active" },
        select: { id: true, centerId: true, teacherId: true },
      }),
    );
    if (!course0) throw new NotFoundError("Course not found or not active");
    // The blacklist is a property of the STUDENT, not of whoever is paying —
    // a parent's money cannot buy a blacklisted child back into a course.
    await assertNotBlacklisted(studentId, course0.centerId, course0.teacherId);

    const settled = await platformDb(
      async (tx) => {
        // Serialize concurrent wallet checkouts so two submits can't both
        // create-and-settle (double-charge). Lock the row that OWNS the money
        // being spent — the student's profile, or the parent's. The FOR UPDATE
        // lock + assertNoDuplicateActive make the loser see the winner's
        // active sub.
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
            // createdBy attributes the ACTION; a student acting for themselves
            // leaves it NULL exactly as before.
            payerUserId ?? undefined,
          ),
        });
        // Debits the payer's wallet ALL-OR-NOTHING (throws + rolls back on
        // insufficient — no subscription, no receipt, no partial debit).
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
      // The child and their parents — so the student always learns their lesson
      // was activated, whoever paid for it.
      recipients: await studentAndParents(studentId),
      type: "payment_recorded",
      title: "Subscription active",
      body: payerUserId
        ? `A parent paid for this subscription from their wallet. Receipt ${settled.receiptNumber}.`
        : `Your subscription is active (paid from wallet). Receipt ${settled.receiptNumber}.`,
      data: { subscriptionId: settled.subscriptionId, receiptNumber: settled.receiptNumber },
    });
    // Same emailed receipt the gateway path sends — a receipt must not depend
    // on which rail the money came down. Post-commit, read-only, never throws.
    void sendPaymentReceiptEmail(settled.receiptNumber, "wallet");
    // Funnel step 4 on the WALLET rail. Living in the kernel is exactly why
    // this line can exist: a helper in apps/www could only ever see the gateway
    // rail, and a "first payment" metric that ignores wallet payments would
    // under-report activation with no way to notice.
    void trackFirstPayment(settled.receiptNumber, "wallet");
    return { walletPaid: true, ...settled };
  }

  // ---- Gateway path (Paymob / mock) ----
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
  intent: { id: string; gatewayRef: string | null; payerUserId?: string | null },
): Promise<SettleNotification | null> {
  const sub = await tx.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) throw new NotFoundError("Subscription vanished during settlement");
  if (sub.status !== "pending_payment") return null; // replay no-op

  // The INTENT is the authority on who paid — not sub.createdBy, which also
  // carries center staff on the walk-in path. NULL keeps the pre-existing
  // "the student paid for themselves" attribution byte-for-byte.
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

/**
 * A student's own subscriptions, or — for a parent naming an APPROVED child —
 * that child's. The parent branch is what stops the pay screen offering a
 * course the child is already covered for; without it the only feedback would
 * be assertNoDuplicateActive throwing after the parent had already committed.
 */
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
      // The student it belongs to, or the parent who STARTED it — a parent may
      // abandon their own unpaid checkout, but not one the child began.
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
