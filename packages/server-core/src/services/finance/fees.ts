export const PLATFORM_TEACHER_FEE = 200;
export const PLATFORM_CENTER_FEE = 200;

export function computeLessonSplit(lessonPrice: number, centerShare: number) {
  return {
    teacherNet: lessonPrice - PLATFORM_TEACHER_FEE - centerShare,
    centerNet: centerShare - PLATFORM_CENTER_FEE,
    platformNet: PLATFORM_TEACHER_FEE + PLATFORM_CENTER_FEE,
  };
}

// ---------------------------------------------------------------------------
// STEP 4.5 PLACEHOLDER — DO NOT TREAT AS FINAL.
// Teacher-direct platform commission, in basis points (1500 = 15%, the
// default decided for Step 4.5). The configurable commission engine
// (per-teacher/per-plan rates managed from the back-office) REPLACES this
// constant in Step 4.5; grep for TEACHER_DIRECT_COMMISSION_BP when it lands.
// ---------------------------------------------------------------------------
export const TEACHER_DIRECT_COMMISSION_BP = 1500;

/** Split for a teacher-direct (no-center) subscription payment: platform
 *  commission only — there is no center share by definition. */
export function computeTeacherDirectSplit(price: number) {
  const commission = Math.round((price * TEACHER_DIRECT_COMMISSION_BP) / 10_000);
  return { teacherNet: price - commission, platformCommission: commission };
}
