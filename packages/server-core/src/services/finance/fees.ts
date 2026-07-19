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

/** Split for a teacher-direct (no-center) subscription payment: platform
 *  commission only — there is no center share by definition. */
export function computeTeacherDirectSplit(price: number, commissionBp: number) {
  const commission = Math.round((price * commissionBp) / 10_000);
  return { teacherNet: price - commission, platformCommission: commission };
}
