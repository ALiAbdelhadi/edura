// PRD §5.1 fee model — pure money math, no infrastructure imports.
// Keep this module dependency-free so unit tests never need a database.

/** Platform fee charged to the teacher per attended session, in piastres (2 EGP). */
export const PLATFORM_TEACHER_FEE = 200;
/** Platform fee charged to the center per attended session, in piastres (2 EGP). */
export const PLATFORM_CENTER_FEE = 200;

export function computeLessonSplit(lessonPrice: number, centerShare: number) {
  return {
    teacherNet: lessonPrice - PLATFORM_TEACHER_FEE - centerShare,
    centerNet: centerShare - PLATFORM_CENTER_FEE,
    platformNet: PLATFORM_TEACHER_FEE + PLATFORM_CENTER_FEE,
  };
}
