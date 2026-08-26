import { platformDb, type TenantTx } from "../../db/scope";
import { ForbiddenError, NotFoundError, BusinessRuleError } from "../../errors/classes";
import { awardPoints } from "../points/points";
import { nextTxnRefs } from "./ref-numbers";
import type { SessionUser } from "../../auth/types";
import { computeAgreementSplit, computeLessonSplit, computeNoRoomLessonSplit, resolveLessonPrice } from "./fees";
import { resolveCommission } from "./commission";
import { lockSessionRow } from "../attendance/lesson-lock";
import { creditMove, resolveFundingLegs, type FundingSource } from "./center-credit";
import { resolveTeacherAgreement, type ResolvedAgreement } from "./agreements";

export { computeLessonSplit };

type Distribution = {
  distributed: boolean;
  reason?: string;
  presentCount?: number;
  perSessionPrice?: number;
  centerShare?: number;
  teacherNetTotal?: number;
  centerNetTotal?: number;
  platformEarned?: number;
  // Phase 4 (D5): the funding split. platformHeldGross flowed through the
  // gateway/wallet; centerHeldGross sits physically with the center, whose
  // credit_balance was debited creditDebited for the teacher's share and the
  // platform's fees on that portion.
  platformHeldGross?: number;
  centerHeldGross?: number;
  creditDebited?: number;
};

/**
 * THE per-course economics of one lesson, at the price given — extracted so the
 * settlement and its PREVIEW cannot compute the split differently. Reads only.
 *
 * ONE rule per course (never both):
 *  • ROOM-BASED Method 2 (per_attending_student) → the center's share per
 *    PRESENT student is the rate frozen on the course (flat piasters, or bp of
 *    perSessionPrice); the platform keeps its % (splitPlatformBp); the teacher
 *    gets the exact remainder. Same computeLessonSplit expression as %-mode.
 *  • ROOM-BASED Method 1 (whole_room_percent) → settle from the 3-way split
 *    SNAPSHOT frozen on the course at creation (superadmin-controlled; never
 *    re-rated). Expressed THROUGH computeLessonSplit by deriving its inputs:
 *    platform fee = platformCut, center fee = 0, centerShare = centerCut; the
 *    teacher gets the remainder (price − platformCut − centerCut), which is
 *    exact — no rounding leak, shares always conserve to the price.
 *  • NO-ROOM course → legacy Step 4.5 flat fees (commission_settings) + the
 *    flat affiliation.centerShare.
 * All branches then run the IDENTICAL ledger writes, wallet updates, and
 * distributedAt exactly-once claim — no parallel money engine.
 *
 * `feeExceedsPrice` is REPORTED, not thrown, because the two callers need
 * opposite things from it: the settlement must abort the transaction, the
 * preview must render the reason on a disabled button.
 */
type LessonCourseShape = {
  pricingMethod: string | null;
  splitPlatformBp: number | null;
  splitCenterBp: number | null;
  m2CenterFee: number | null;
  m2CenterBp: number | null;
};
type LessonEconomics = {
  centerShare: number;
  fees: { platformTeacherFee: number; platformCenterFee: number };
  /** Appended to the commission ledger notes ONLY when a clamp actually bit, so
   *  an operator can see from the books that the course was misconfigured. */
  clampedNote: string;
  feeExceedsPrice: boolean;
};
/** The no-room branch's DB reads, hoisted so a per-student loop does not repeat
 *  them. They do not depend on the price — only the arithmetic does. */
type LessonRates = {
  affiliationCenterShare: number;
  commission: { platformTeacherFee: number; platformCenterFee: number };
  /** Phase 5 (D1/D2): the teacher agreement live ON THE LESSON'S DATE, or
   *  null. Applies to the NO-ROOM branch only — a room-based course is
   *  governed by its frozen room economics ("ONE rule per course"). */
  agreement: ResolvedAgreement | null;
};

async function loadLessonRates(
  tx: TenantTx,
  args: { centerId: string; teacherId: string; onDate: Date },
): Promise<LessonRates> {
  const affiliation = await tx.centerTeacherAffiliation.findFirst({
    where: { centerId: args.centerId, teacherId: args.teacherId, status: "active" },
    select: { centerShare: true },
  });
  // Step 4.5: platform fees come from commission_settings (resolved inside the
  // same DB transaction so the split and its ledger rows always agree).
  const commission = await resolveCommission(tx, {
    teacherId: args.teacherId,
    centerId: args.centerId,
  });
  const agreement = await resolveTeacherAgreement(tx, {
    centerId: args.centerId,
    teacherId: args.teacherId,
    onDate: args.onDate,
  });
  return { affiliationCenterShare: affiliation?.centerShare ?? 0, commission, agreement };
}

/** PURE — the same inputs always give the same split, which is what lets the
 *  preview and the settlement quote one number. */
function economicsAt(
  perSessionPrice: number,
  course: LessonCourseShape,
  rates: LessonRates,
): LessonEconomics {
  if (course.pricingMethod === "per_attending_student") {
    const platformCut = Math.round((perSessionPrice * (course.splitPlatformBp ?? 0)) / 10_000);
    const centerShare =
      course.m2CenterFee ?? Math.round((perSessionPrice * (course.m2CenterBp ?? 0)) / 10_000);
    return {
      centerShare,
      fees: { platformTeacherFee: platformCut, platformCenterFee: 0 },
      clampedNote: "",
      feeExceedsPrice: perSessionPrice - platformCut - centerShare < 0,
    };
  }

  if (course.splitPlatformBp != null && course.splitCenterBp != null) {
    const platformCut = Math.round((perSessionPrice * course.splitPlatformBp) / 10_000);
    return {
      centerShare: Math.round((perSessionPrice * course.splitCenterBp) / 10_000),
      fees: { platformTeacherFee: platformCut, platformCenterFee: 0 },
      clampedNote: "",
      feeExceedsPrice: false,
    };
  }

  // Phase 5 (D1): an agreement live on the lesson's date REPLACES the flat
  // affiliation figure on the no-room branch — the rate prices the
  // non-residual side, the residual keeps the remainder, and both directions
  // flow through the same computeLessonSplit identity via centerShare.
  if (rates.agreement) {
    const ag = computeAgreementSplit(perSessionPrice, rates.agreement, rates.commission);
    return {
      centerShare: ag.centerShare,
      fees: ag.fees,
      clampedNote: ag.clamped ? " — capped to the lesson's value (agreement)" : "",
      feeExceedsPrice: false,
    };
  }

  // C-01: the flat two-sided fee model produces a NEGATIVE net whenever the
  // lesson price does not cover both fees plus the center's flat share — most
  // of all when centerShare is 0, which is the default. Crediting a negative is
  // a wallet debit and the H2 CHECK aborted the whole settlement (500), so the
  // lesson could never settle. computeNoRoomLessonSplit is THE shared derivation
  // (refund reversal uses the very same call) and clamps so both nets are
  // non-negative by construction. No-op for correctly configured courses.
  const noRoom = computeNoRoomLessonSplit(
    perSessionPrice,
    rates.affiliationCenterShare,
    rates.commission,
  );
  return {
    centerShare: noRoom.centerShare,
    fees: noRoom.fees,
    clampedNote: noRoom.clamped
      ? ` — capped to the lesson's value (price ${perSessionPrice}, center share ${rates.affiliationCenterShare})`
      : "",
    feeExceedsPrice: false,
  };
}

async function resolveLessonEconomics(
  tx: TenantTx,
  args: {
    course: LessonCourseShape;
    centerId: string;
    teacherId: string;
    perSessionPrice: number;
    onDate: Date;
  },
): Promise<LessonEconomics> {
  const rates = await loadLessonRates(tx, {
    centerId: args.centerId,
    teacherId: args.teacherId,
    onDate: args.onDate,
  });
  return economicsAt(args.perSessionPrice, args.course, rates);
}

/**
 * WHAT EACH PRESENT STUDENT'S LESSON IS WORTH.
 *
 * For `course_price` / `session_price` every student settles at the same
 * course-level figure — one number, exactly as before this existed.
 *
 * For `subscription` the answer is per student, and it is the only basis that
 * can never distribute money the platform did not collect:
 *   • a SINGLE-SESSION pass tied to this lesson → its own price, exact.
 *   • a MONTHLY plan covering this lesson's date → its price divided by the
 *     lessons its period ACTUALLY contains. That divisor is counted from the
 *     schedule, so it is a measurement, not the guess that "lessons per month"
 *     would be if we invented it from `daysOfWeek`.
 *   • no live coverage → 0. The student attended without paying, so there is
 *     nothing of theirs to split. They are not an error and do not block the
 *     lesson; they simply contribute nothing, which is the truth.
 */
async function resolveStudentLessonPrices(
  tx: TenantTx,
  args: {
    course: { id: string; price: number; pricePerSession: number | null; settlementBasis: string };
    sessionId: string;
    sessionDate: Date;
    studentIds: string[];
    courseLevelPrice: number;
  },
): Promise<Map<string, number>> {
  const { course, sessionId, sessionDate, studentIds, courseLevelPrice } = args;
  const out = new Map<string, number>();

  if (course.settlementBasis !== "subscription") {
    for (const id of studentIds) out.set(id, courseLevelPrice);
    return out;
  }

  const subs = await tx.subscription.findMany({
    where: { courseId: course.id, studentId: { in: studentIds }, status: "active" },
    select: {
      studentId: true,
      plan: true,
      price: true,
      sessionId: true,
      periodStart: true,
      periodEnd: true,
    },
  });

  // Count a period's lessons once per distinct window, not once per student.
  const lessonsInPeriod = new Map<string, number>();
  const countFor = async (from: Date, to: Date) => {
    const key = `${from.toISOString()}|${to.toISOString()}`;
    const cached = lessonsInPeriod.get(key);
    if (cached !== undefined) return cached;
    const n = await tx.session.count({
      where: { courseId: course.id, date: { gte: from, lte: to }, status: { not: "cancelled" } },
    });
    lessonsInPeriod.set(key, n);
    return n;
  };

  for (const id of studentIds) {
    const mine = subs.filter((s) => s.studentId === id);
    // A pass bought for THIS lesson is the most specific coverage there is.
    const pass = mine.find((s) => s.plan === "per_session" && s.sessionId === sessionId);
    if (pass) {
      out.set(id, pass.price);
      continue;
    }
    const monthly = mine.find(
      (s) =>
        s.plan === "monthly" &&
        s.periodStart != null &&
        s.periodEnd != null &&
        s.periodStart <= sessionDate &&
        sessionDate <= s.periodEnd,
    );
    if (monthly) {
      const n = await countFor(monthly.periodStart as Date, monthly.periodEnd as Date);
      out.set(id, n > 0 ? Math.round(monthly.price / n) : monthly.price);
      continue;
    }
    out.set(id, 0);
  }
  return out;
}

export async function distributeSessionRevenue(
  tx: TenantTx,
  sessionId: string,
  settledBy?: string,
): Promise<Distribution> {
  // Phase 0: take the session row lock BEFORE reading the present set, and
  // hold it for the rest of this transaction. Every attendance writer takes
  // the same lock before writing (see attendance/lesson-lock.ts), so a
  // check-in can no longer slip between our attendance read and the
  // distributedAt claim — it blocks here briefly, then sees the committed
  // claim and refuses. The claim below stays the exactly-once witness; this
  // lock only fixes WHO reads first. Deliberately NOT taken by the preview,
  // which must never serialize anything.
  await lockSessionRow(tx, sessionId);
  const session = await tx.session.findUnique({ where: { id: sessionId } });
  if (!session) throw new NotFoundError("Session not found");

  const course = await tx.course.findUnique({ where: { id: session.courseId } });
  if (!course) throw new NotFoundError("Course not found");

  // Teacher-direct courses (NULL centerId): revenue is settled at SUBSCRIPTION
  // PAYMENT time (price − platform commission straight to the teacher wallet,
  // see subscriptions settlement). Skipping here is the double-pay guard —
  // session completion must never pay the teacher a second time.
  if (!course.centerId) {
    return { distributed: false, reason: "teacher_direct_settled_at_payment" };
  }
  const centerId = course.centerId;
  const teacherId = course.teacherId;

  const present = await tx.attendanceRecord.findMany({
    where: { sessionId, status: "present" },
    select: { studentId: true },
  });
  if (present.length === 0) return { distributed: false, reason: "no_present_students" };

  // THE VALUE OF ONE LESSON, per student. `resolveLessonPrice` gives the
  // course-level figure (the ONLY derivation, shared with every preview, so a
  // confirm button can never quote an amount the ledger will not write), and
  // `resolveStudentLessonPrices` applies the course's chosen basis — which for
  // `subscription` differs per attendee.
  const plannedSessions = await tx.session.count({ where: { courseId: course.id } });
  const courseLevelPrice = resolveLessonPrice(course, plannedSessions);
  const priceFor = await resolveStudentLessonPrices(tx, {
    course,
    sessionId,
    sessionDate: session.date,
    studentIds: present.map((p) => p.studentId),
    courseLevelPrice,
  });

  // D5: who physically holds each present student's money. Resolved from the
  // covering subscription's paymentMethod; no coverage = center-held, the
  // default that can never make the platform pay out money it does not hold.
  const fundingFor = await resolveFundingLegs(tx, {
    courseId: course.id,
    sessionId,
    sessionDate: session.date,
    studentIds: present.map((p) => p.studentId),
  });

  const claim = await tx.session.updateMany({
    where: { id: sessionId, distributedAt: null },
    data: { distributedAt: new Date() },
  });
  if (claim.count === 0) return { distributed: false, reason: "already_distributed" };

  // Read the no-room rates ONCE; the arithmetic below runs per student.
  const rates = await loadLessonRates(tx, { centerId, teacherId, onDate: session.date });

  // A flat per-student fee can exceed a cheap/unpriced course's lesson price;
  // the teacher's remainder must never go negative (H2 wallet floor). Throw
  // BEFORE anything persists — the whole tx (incl. the status update and the
  // distributedAt claim above) rolls back, the session stays completable.
  // The PREVIEW reads the same flag and reports it instead of throwing.
  // Checked for EVERY attendee: under the subscription basis one student's
  // coverage can be too small for the hall's fee while another's is fine.
  for (const { studentId } of present) {
    if (economicsAt(priceFor.get(studentId) ?? 0, course, rates).feeExceedsPrice) {
      throw new BusinessRuleError(
        "The hall's per-student fee exceeds this lesson's price — set the course pricing before completing sessions",
      );
    }
  }

  // A LESSON WITH NO PRICE MUST NOT SETTLE — it must refuse to complete.
  //
  // Settling it anyway looks harmless (every share is zero) and is the worst
  // outcome available: it writes zero-value ledger rows, files a zero
  // session_settlement, and claims `distributedAt` — so the lesson can NEVER
  // be settled again, even after someone notices the price and fixes it. Cash
  // already collected at the counter is then stranded permanently.
  //
  // Throwing rolls the whole transaction back, including the claim above AND
  // the `status: "completed"` write in completeSession, exactly as the
  // Method-2 fee guard does. The lesson stays completable, and completing it
  // once priced settles it correctly. This guard sits AFTER the branch
  // resolution on purpose: Method 2's negative-net guard has already thrown
  // with the more specific diagnosis when a flat fee is what broke it.
  // Under `subscription` a single unpaid attendee resolves to 0 and that is a
  // truthful nil contribution, not a misconfiguration — so the refusal is
  // "NOBODY here is priced", not "someone is".
  if (present.every(({ studentId }) => (priceFor.get(studentId) ?? 0) <= 0)) {
    throw new BusinessRuleError(
      "This lesson has no price — set the class pricing before completing sessions",
    );
  }

  // Method 2 stamps the frozen rate into the commission notes (auditability);
  // Method 1 / legacy notes stay byte-identical. The clamp note is per student,
  // so it is read from that student's own economics inside the loop.
  const methodNote =
    course.pricingMethod === "per_attending_student"
      ? course.m2CenterFee != null
        ? ` — per-student method, ${(course.m2CenterFee / 100).toFixed(2)} EGP/student`
        : ` — per-student method, ${(course.m2CenterBp ?? 0) / 100}%/student`
      : "";

  const refs = await nextTxnRefs(tx, present.length * 3);

  let teacherNetTotal = 0;
  let centerNetTotal = 0;
  let platformTotal = 0;
  let grossTotal = 0;
  // D5 split accumulators. centerNetPlatformHeld is the ONLY amount that may
  // reach wallet_balance; the center-held teacher/fee sums become credit
  // debits — the center holds that money and owes it on.
  let platformHeldGross = 0;
  let centerHeldGross = 0;
  let centerNetPlatformHeld = 0;
  let centerHeldTeacherNet = 0;
  let centerHeldFees = 0;

  const rows: Parameters<TenantTx["transaction"]["createMany"]>[0]["data"] = [];
  for (let i = 0; i < present.length; i++) {
    const { studentId } = present[i];
    // Per student, because the subscription basis can price two attendees of
    // the SAME lesson differently. For the other two bases every iteration
    // resolves the identical figure, so those courses settle byte-identically
    // to before this loop existed.
    const studentPrice = priceFor.get(studentId) ?? 0;
    const { centerShare, fees, clampedNote } = economicsAt(studentPrice, course, rates);
    const { teacherNet, centerNet } = computeLessonSplit(studentPrice, centerShare, fees);
    const noteSuffix = methodNote + clampedNote;
    const funding: FundingSource = fundingFor.get(studentId) ?? "center_held";
    teacherNetTotal += teacherNet;
    centerNetTotal += centerNet;
    platformTotal += fees.platformTeacherFee + fees.platformCenterFee;
    grossTotal += studentPrice;
    if (funding === "platform_held") {
      platformHeldGross += studentPrice;
      centerNetPlatformHeld += centerNet;
    } else {
      centerHeldGross += studentPrice;
      centerHeldTeacherNet += teacherNet;
      centerHeldFees += fees.platformTeacherFee + fees.platformCenterFee;
    }

    const [paymentRef, teacherFeeRef, centerFeeRef] = refs.slice(i * 3, i * 3 + 3);
    rows.push(
      {
        refNumber: paymentRef,
        type: "payment",
        amount: studentPrice,
        fromEntityId: studentId,
        toEntityId: centerId,
        centerId,
        lessonId: sessionId,
        status: "completed",
        // D5: stamped at INSERT so a refund (and any report) reads who held
        // this student's money instead of re-deriving it later.
        funding,
        // Inherited from the group, like every other row in this chain, so a
        // center's finance report can separate platform-collected money from
        // money its staff keyed in for an off-system teacher without joining
        // back through course -> teacher.
        dataSource: course.dataSource,
        notes: "Lesson revenue",
      },
      {
        refNumber: teacherFeeRef,
        type: "commission",
        amount: fees.platformTeacherFee,
        fromEntityId: teacherId,
        toEntityId: null,
        centerId,
        lessonId: sessionId,
        status: "completed",
        // Inherited from the group, like every other row in this chain, so a
        // center's finance report can separate platform-collected money from
        // money its staff keyed in for an off-system teacher without joining
        // back through course -> teacher.
        dataSource: course.dataSource,
        notes: `Platform fee (teacher side)${noteSuffix}`,
      },
      {
        refNumber: centerFeeRef,
        type: "commission",
        amount: fees.platformCenterFee,
        fromEntityId: centerId,
        toEntityId: null,
        centerId,
        lessonId: sessionId,
        status: "completed",
        // Inherited from the group, like every other row in this chain, so a
        // center's finance report can separate platform-collected money from
        // money its staff keyed in for an off-system teacher without joining
        // back through course -> teacher.
        dataSource: course.dataSource,
        notes: `Platform fee (center side)${noteSuffix}`,
      },
    );
    await awardPoints(tx, studentId, "attendance", { reason: "Attended a lesson" });
  }

  await tx.transaction.createMany({ data: rows });

  // Per-session settlement record — EVERY settled lesson (Phase 3; this is
  // the spec's Session_Financials). pricing_method NULL = the legacy no-room
  // fee model. Same tx as the ledger; UNIQUE(session_id) doubles as an
  // exactly-once witness beside the distributedAt claim. present_count
  // freezes the settled attendee set so post-settlement attendance edits are
  // detectable.
  {
    await tx.sessionSettlement.create({
      data: {
        sessionId,
        courseId: course.id,
        centerId,
        teacherId,
        roomId: session.roomId ?? course.defaultRoomId,
        pricingMethod: course.pricingMethod,
        presentCount: present.length,
        // The unit price this lesson settled at. Under the two course-level
        // bases every attendee paid it, so it is exact. Under `subscription`
        // attendees can differ, and this is their MEAN — the three totals
        // beside it are the exact figures, and they are what the reports read.
        perSessionPrice: Math.round(grossTotal / present.length),
        platformHeldGross,
        centerHeldGross,
        platformTotal,
        centerTotal: centerNetTotal,
        teacherTotal: teacherNetTotal,
        m2CenterFee: course.m2CenterFee,
        m2CenterBp: course.m2CenterBp,
        settledBy: settledBy ?? teacherId,
      },
    });
  }

  // The teacher is owed their full net whoever held the gross — for the
  // center-held part the CENTER owes it on, which is exactly the credit debit.
  if (teacherNetTotal !== 0) {
    await tx.teacherProfile.updateMany({
      where: { userId: teacherId },
      data: { walletBalance: { increment: teacherNetTotal } },
    });
  }
  // D5 — THE F2 FIX: wallet_balance (platform-held payable) is credited ONLY
  // with the center's net on money the platform actually holds. The center's
  // net on cash it collected itself is already in its own drawer; crediting it
  // here was the double-pay.
  if (centerNetPlatformHeld !== 0) {
    await tx.center.update({
      where: { id: centerId },
      data: { walletBalance: { increment: centerNetPlatformHeld } },
    });
  }
  // The center-held obligations, each with its lesson reference — §4.8's fix:
  // arrears become a visible, chaseable number instead of an invisible row.
  if (centerHeldTeacherNet > 0) {
    await creditMove(tx, {
      centerId,
      type: "teacher_debit",
      delta: -centerHeldTeacherNet,
      sessionId,
      recordedBy: settledBy ?? teacherId,
      reason: "Teacher share of center-collected lesson revenue",
    });
  }
  if (centerHeldFees > 0) {
    await creditMove(tx, {
      centerId,
      type: "commission_debit",
      delta: -centerHeldFees,
      sessionId,
      recordedBy: settledBy ?? teacherId,
      reason: "Platform fees on center-collected lesson revenue",
    });
  }

  return {
    distributed: true,
    presentCount: present.length,
    perSessionPrice: Math.round(grossTotal / present.length),
    teacherNetTotal,
    centerNetTotal,
    platformEarned: platformTotal,
    platformHeldGross,
    centerHeldGross,
    creditDebited: centerHeldTeacherNet + centerHeldFees,
  };
}

/**
 * Who may act on this session — extracted so the PREVIEW and the COMMIT cannot
 * be reached by different people. A preview shows money (the lesson's price,
 * the head-count, the frozen split), so it is not a lesser permission than the
 * commit and must not be guarded more loosely.
 */
async function assertMaySettle(
  tx: TenantTx,
  sessionId: string,
  user: SessionUser,
): Promise<{
  session: NonNullable<Awaited<ReturnType<TenantTx["session"]["findUnique"]>>>;
  course: { centerId: string | null; teacherId: string };
}> {
  const session = await tx.session.findUnique({ where: { id: sessionId } });
  if (!session) throw new NotFoundError("Session not found");

  const course = await tx.course.findUnique({
    where: { id: session.courseId },
    select: { centerId: true, teacherId: true },
  });
  if (!course) throw new NotFoundError("Course not found");

  if (user.role === "teacher") {
    if (session.teacherId !== user.id) {
      throw new ForbiddenError("Only the session's teacher can complete it");
    }
  } else if (user.role === "center_admin") {
    if (course.centerId !== user.centerId) {
      throw new ForbiddenError("Session belongs to a different center");
    }
  } else {
    throw new ForbiddenError();
  }

  return { session, course };
}

/**
 * READ-ONLY: exactly what completing this lesson would distribute, at the
 * course's frozen rates. Writes nothing, settles nothing, claims nothing.
 *
 * It exists so the confirm button can carry its own amount
 * (`design/CONSTITUTION.md` §1) without the caller re-deriving money — the
 * price comes from `resolveLessonPrice`, the same function the settlement
 * itself calls, so the quoted figure and the written figure are the same
 * expression rather than two that happen to agree today.
 */
export async function previewSessionSettlement(sessionId: string, user: SessionUser) {
  return platformDb(
    async (tx) => {
      const { session, course } = await assertMaySettle(tx, sessionId, user);

      const [presentRows, counterOnlyCount, plannedSessions, full] = await Promise.all([
        tx.attendanceRecord.findMany({
          where: { sessionId, status: "present" },
          select: { studentId: true },
        }),
        // Phase 3: students who passed the counter but never the door
        // (counter_and_door mode) are EXCLUDED from the money by design. The
        // preview names their number so a receptionist pressing "end lesson"
        // sees "excluded by design", never "excluded by surprise".
        tx.attendanceRecord.count({ where: { sessionId, status: "counter_only" } }),
        tx.session.count({ where: { courseId: session.courseId } }),
        tx.course.findUnique({
          where: { id: session.courseId },
          select: {
            id: true,
            title: true,
            price: true,
            pricePerSession: true,
            settlementBasis: true,
            pricingMethod: true,
            splitPlatformBp: true,
            splitTeacherBp: true,
            splitCenterBp: true,
            m2CenterFee: true,
            m2CenterBp: true,
          },
        }),
      ]);
      const present = presentRows.length;

      const courseLevelPrice = resolveLessonPrice(
        {
          price: full?.price ?? 0,
          pricePerSession: full?.pricePerSession ?? null,
          settlementBasis: full?.settlementBasis ?? null,
        },
        plannedSessions,
      );

      // THE PREVIEW WALKS THE SAME LOOP THE SETTLEMENT WALKS. Under the
      // `subscription` basis two attendees of one lesson can settle at different
      // prices, so a single course-level figure would be a quote the ledger
      // never writes — the exact failure this whole surface exists to prevent.
      // Same price resolver, same economics, same split; only the writes are
      // absent.
      const priceFor = full
        ? await resolveStudentLessonPrices(tx, {
            course: {
              id: full.id,
              price: full.price,
              pricePerSession: full.pricePerSession,
              settlementBasis: full.settlementBasis,
            },
            sessionId,
            sessionDate: session.date,
            studentIds: presentRows.map((p) => p.studentId),
            courseLevelPrice,
          })
        : new Map<string, number>();

      const courseShape = {
        pricingMethod: full?.pricingMethod ?? null,
        splitPlatformBp: full?.splitPlatformBp ?? null,
        splitCenterBp: full?.splitCenterBp ?? null,
        m2CenterFee: full?.m2CenterFee ?? null,
        m2CenterBp: full?.m2CenterBp ?? null,
      };
      const rates =
        course.centerId && present > 0
          ? await loadLessonRates(tx, {
              centerId: course.centerId,
              teacherId: course.teacherId,
              onDate: session.date,
            })
          : null;

      // D5: the same funding resolution the settlement runs, so the preview
      // can say how much of the gross the center already holds.
      const previewFunding =
        course.centerId && present > 0
          ? await resolveFundingLegs(tx, {
              courseId: session.courseId,
              sessionId,
              sessionDate: session.date,
              studentIds: presentRows.map((p) => p.studentId),
            })
          : new Map<string, FundingSource>();

      let gross = 0,
        teacherTotal = 0,
        centerTotal = 0,
        platformTotal = 0,
        pvPlatformHeld = 0,
        pvCenterHeld = 0,
        feeExceeds = false;
      if (rates) {
        for (const { studentId } of presentRows) {
          const price = priceFor.get(studentId) ?? 0;
          const e = economicsAt(price, courseShape, rates);
          const s = computeLessonSplit(price, e.centerShare, e.fees);
          gross += price;
          teacherTotal += s.teacherNet;
          centerTotal += s.centerNet;
          platformTotal += e.fees.platformTeacherFee + e.fees.platformCenterFee;
          if ((previewFunding.get(studentId) ?? "center_held") === "platform_held") {
            pvPlatformHeld += price;
          } else {
            pvCenterHeld += price;
          }
          feeExceeds = feeExceeds || e.feeExceedsPrice;
        }
      }
      // The headline unit price: exact when every attendee settles the same
      // (both course-level bases), their mean under `subscription`.
      const perSessionPrice = present > 0 ? Math.round(gross / present) : courseLevelPrice;
      const split = rates && present > 0 ? { teacherTotal, centerTotal, platformTotal } : null;

      return {
        sessionId,
        courseTitle: full?.title ?? null,
        status: session.status,
        // Every reason the button must not be offered as a live action, decided
        // on the server so the screen never has to infer one from a 500.
        alreadySettled: session.distributedAt !== null,
        settledAt: session.distributedAt,
        cancelled: session.status === "cancelled",
        // "Unpriced" is the settlement's own rule: NOBODY here is priced. One
        // unpaid attendee among several is a truthful nil contribution, not a
        // blocked lesson.
        unpriced: present > 0 ? gross <= 0 : courseLevelPrice <= 0,
        nothingToSettle: present === 0,
        counterOnlyCount,
        // D5: how much of the gross each side physically holds.
        platformHeldGross: pvPlatformHeld,
        centerHeldGross: pvCenterHeld,
        feeExceedsPrice: feeExceeds,
        isTeacherDirect: course.centerId === null,

        presentCount: present,
        plannedSessions,
        perSessionPrice,
        settlementBasis: full?.settlementBasis ?? null,
        // Every intermediate figure, nothing pre-summed (CONSTITUTION §1). Under
        // `subscription` the per-student line is a MEAN, so the screen must show
        // the totals as the authoritative figures — which it does.
        perStudent: split
          ? {
              platform: Math.round(split.platformTotal / present),
              center: Math.round(split.centerTotal / present),
              teacher: Math.round(split.teacherTotal / present),
            }
          : null,
        total: split
          ? {
              platform: split.platformTotal,
              center: split.centerTotal,
              teacher: split.teacherTotal,
              gross,
            }
          : null,
        // The FROZEN economics this lesson settles at (never re-rated).
        pricingMethod: full?.pricingMethod ?? null,
        splitPlatformBp: full?.splitPlatformBp ?? null,
        splitTeacherBp: full?.splitTeacherBp ?? null,
        splitCenterBp: full?.splitCenterBp ?? null,
      };
    },
    { actorId: user.id },
  );
}

export async function completeSession(sessionId: string, user: SessionUser) {
  return platformDb(
    async (tx) => {
      const { session } = await assertMaySettle(tx, sessionId, user);

      if (session.status === "cancelled") {
        throw new BusinessRuleError("A cancelled session cannot be completed");
      }

      const wasCompleted = session.status === "completed";
      const updated = wasCompleted
        ? session
        : await tx.session.update({
            where: { id: sessionId },
            data: { status: "completed", editedAt: new Date() },
          });

      const distribution = await distributeSessionRevenue(tx, sessionId, user.id);
      return { session: updated, distribution };
    },
    { actorId: user.id },
  );
}
