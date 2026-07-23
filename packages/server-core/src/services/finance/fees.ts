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
