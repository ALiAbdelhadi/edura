// Platform fee math (Step 4.5): all rates/fees come from commission_settings
// via resolveCommission() — see ./commission.ts. These functions are pure;
// callers pass the resolved values so the charge and its ledger notes always
// agree on what was applied.

/** Center-course per-present-student split (PRD §5.1). */
export function computeLessonSplit(
  lessonPrice: number,
  centerShare: number,
  fees: { platformTeacherFee: number; platformCenterFee: number },
) {
  return {
    teacherNet: lessonPrice - fees.platformTeacherFee - centerShare,
    centerNet: centerShare - fees.platformCenterFee,
    platformNet: fees.platformTeacherFee + fees.platformCenterFee,
  };
}

/**
 * NO-ROOM (legacy Step 4.5) center-course split — THE single source of truth
 * for that branch, shared by session distribution and by refund reversal so the
 * two can never disagree about what was charged.
 *
 * The flat two-sided fee model (platformTeacherFee + platformCenterFee) assumes
 * the lesson price actually covers both fees AND the center's flat share. When
 * it does not — most importantly when `affiliation.centerShare` is 0, which is
 * the DEFAULT (collaboration requests force 0 per decision #3, and
 * POST /api/v1/courses never sets one) — the raw arithmetic produces a NEGATIVE
 * beneficiary net. Crediting a negative amount is a wallet DEBIT, which the H2
 * `wallet_balance >= 0` CHECK correctly refuses, so the whole settlement
 * transaction used to abort with a 500 and the lesson could never settle at all
 * (the teacher was never paid).
 *
 * The money semantics we settle on, applied as three ordered `min()` clamps:
 *
 *   1. The teacher-side platform fee comes off the TOP of the lesson price. The
 *      platform can never charge more fee than the lesson actually earned.
 *   2. The center's flat share is paid out of WHAT REMAINS after that fee. A
 *      center can never be paid more than the lesson brought in — this is what
 *      keeps `teacherNet >= 0`.
 *   3. The center-side platform fee is a COMMISSION ON THE CENTER'S SHARE, so it
 *      is capped at that share. No share earned → no commission owed. This is
 *      what keeps `centerNet >= 0`, and it matches what the room-based branches
 *      already do (both pass `platformCenterFee: 0` and take the platform's cut
 *      out of the price via `splitPlatformBp`, never out of the center's pocket).
 *
 * Every clamp only ever REDUCES a charge; none invents one. When the course is
 * configured so the price covers the fees and the share, all three are no-ops
 * and the result is byte-identical to the previous behaviour — so correctly
 * configured courses do not change. Platform revenue is strictly >= before,
 * because the previous behaviour in the clamped cases was a rolled-back
 * transaction that collected nothing.
 *
 * Both nets are non-negative BY CONSTRUCTION, so the H2 floor is never
 * approached from below — the constraint is relied upon, not weakened.
 */
export function computeNoRoomLessonSplit(
  perSessionPrice: number,
  rawCenterShare: number,
  resolved: { platformTeacherFee: number; platformCenterFee: number },
): {
  centerShare: number;
  fees: { platformTeacherFee: number; platformCenterFee: number };
  clamped: boolean;
} {
  const price = Math.max(0, perSessionPrice);
  const rawShare = Math.max(0, rawCenterShare);

  // (1) fee off the top, never more than the lesson earned
  const platformTeacherFee = Math.min(resolved.platformTeacherFee, price);
  // (2) the center is paid out of the remainder -> teacherNet >= 0
  const centerShare = Math.min(rawShare, price - platformTeacherFee);
  // (3) the center-side fee is a commission on that share -> centerNet >= 0
  const platformCenterFee = Math.min(resolved.platformCenterFee, centerShare);

  return {
    centerShare,
    fees: { platformTeacherFee, platformCenterFee },
    clamped:
      platformTeacherFee !== resolved.platformTeacherFee ||
      centerShare !== rawShare ||
      platformCenterFee !== resolved.platformCenterFee,
  };
}

/** Split for a teacher-direct (no-center) subscription payment: platform
 *  commission only — there is no center share by definition. */
export function computeTeacherDirectSplit(price: number, commissionBp: number) {
  const commission = Math.round((price * commissionBp) / 10_000);
  return { teacherNet: price - commission, platformCommission: commission };
}

/**
 * THE value of one lesson — the single derivation, so a screen can never quote
 * a number the ledger will not settle.
 *
 * There were THREE copies of this before, and two of them disagreed. The
 * settlement engine read `course.price / plannedSessions`; the back office's
 * settlement PREVIEW read `pricePerSession` first. On dev, 13 of the 14 courses
 * carrying both prices disagree — often by 2-3x (56.25 vs 150.00 EGP a lesson).
 * So the operator was shown one amount on the confirm button and the ledger
 * wrote another, which is exactly the lie `design/CONSTITUTION.md` §1 forbids
 * ("the button carries its own amount"). One function, every caller.
 *
 * WHICH price is now the COURSE'S OWN CHOICE (`courses.settlement_basis`),
 * because a course carrying both is genuinely ambiguous — a full-term enrolment
 * amortises cheaper per lesson than a drop-in pass, and both numbers are real.
 * Leaving that to whichever function read the row first is what produced the
 * disagreement above.
 *
 *   • `course_price`  — `price / plannedSessions`. The DEFAULT, and exactly the
 *     behaviour that predates the column, so no live course re-rates.
 *     Falls back to `pricePerSession` when the legacy column is unset, which is
 *     how a course born from an accepted collaboration request arrives — that
 *     fallback is what stops such a lesson settling at zero.
 *   • `session_price` — `pricePerSession`, the value of one lesson by
 *     definition. Falls back to the amortised legacy price when unset, so the
 *     basis can be chosen before the plan price is filled in without the lesson
 *     silently becoming unsettleable.
 *   • `subscription`  — NOT resolvable here: the answer differs per attending
 *     student, so it is `resolveStudentLessonPrice` in the engine. This
 *     function returns the course-level figure a screen shows as the headline,
 *     and callers that can settle must not use it for that basis.
 */
export function resolveLessonPrice(
  course: {
    price: number;
    pricePerSession?: number | null;
    settlementBasis?: "course_price" | "session_price" | "subscription" | null;
  },
  plannedSessions: number,
): number {
  const amortised =
    course.price > 0
      ? plannedSessions > 0
        ? Math.round(course.price / plannedSessions)
        : course.price
      : 0;
  const perSession = course.pricePerSession ?? 0;

  // `subscription` has no single course-level answer; the amortised figure is
  // the closest honest headline, and the engine overrides it per student.
  if (course.settlementBasis === "session_price") return perSession || amortised;
  return amortised || perSession;
}

/**
 * TEACHER-AGREEMENT split (Phase 5, D1) — expressed THROUGH the same
 * computeLessonSplit identity by deriving `centerShare`, so it is not a second
 * money engine, and the settlement and the refund reversal share one
 * derivation exactly as the no-room branch does.
 *
 * The agreement's rate prices the NON-RESIDUAL side out of the POST-FEE NET
 * (net = price − both platform fees, each first capped so it never exceeds
 * what remains — the same "a clamp only ever REDUCES a charge" discipline as
 * computeNoRoomLessonSplit):
 *
 *   residual='teacher': the rate is the CENTER's share — today's direction
 *     with a contract instead of the flat affiliation figure. The result is
 *     handed to computeNoRoomLessonSplit's own clamps, so the H2 posture is
 *     identical to the branch it refines.
 *   residual='center' (the spec's direction): the rate is the TEACHER's take;
 *     the center keeps the remainder. Ordered clamps per D1:
 *       (1) teacher-side fee off the top, capped at the price;
 *       (2) center-side fee capped at what remains (a fee is never invented);
 *       (3) the teacher's amount capped at the remaining net → centerNet ≥ 0
 *           BY CONSTRUCTION, and teacherNet ≥ 0 because the take is ≥ 0.
 *     centerShare = price − teacherFee − teacherTake, which makes
 *     computeLessonSplit return exactly (teacherTake, net − teacherTake).
 *
 * Both nets are non-negative by construction — the H2 floor is relied upon,
 * never approached from below.
 */
export function computeAgreementSplit(
  perSessionPrice: number,
  agreement: {
    basis: "percent_of_net" | "fixed_per_student";
    rateBp: number | null;
    rateFlat: number | null;
    residual: "teacher" | "center";
  },
  resolved: { platformTeacherFee: number; platformCenterFee: number },
): {
  centerShare: number;
  fees: { platformTeacherFee: number; platformCenterFee: number };
  clamped: boolean;
} {
  const price = Math.max(0, perSessionPrice);
  const teacherFee = Math.min(resolved.platformTeacherFee, price);
  const centerFee = Math.min(resolved.platformCenterFee, price - teacherFee);
  const net = price - teacherFee - centerFee;

  const rawTake =
    agreement.basis === "percent_of_net"
      ? Math.round((net * (agreement.rateBp ?? 0)) / 10_000)
      : Math.max(0, agreement.rateFlat ?? 0);

  if (agreement.residual === "center") {
    // The rate is the TEACHER's take; the center keeps net − take.
    const teacherTake = Math.min(rawTake, net);
    return {
      centerShare: price - teacherFee - teacherTake,
      fees: { platformTeacherFee: teacherFee, platformCenterFee: centerFee },
      clamped:
        teacherFee !== resolved.platformTeacherFee ||
        centerFee !== resolved.platformCenterFee ||
        teacherTake !== rawTake,
    };
  }

  // residual='teacher': the rate is the CENTER's share — hand it to the
  // no-room clamps, which already guarantee both nets ≥ 0.
  const noRoom = computeNoRoomLessonSplit(price, Math.min(rawTake, net), resolved);
  return {
    centerShare: noRoom.centerShare,
    fees: noRoom.fees,
    clamped: noRoom.clamped || rawTake > net,
  };
}

