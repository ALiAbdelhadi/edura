export const PLATFORM_TEACHER_FEE = 200;
export const PLATFORM_CENTER_FEE = 200;

export function computeLessonSplit(lessonPrice: number, centerShare: number) {
  return {
    teacherNet: lessonPrice - PLATFORM_TEACHER_FEE - centerShare,
    centerNet: centerShare - PLATFORM_CENTER_FEE,
    platformNet: PLATFORM_TEACHER_FEE + PLATFORM_CENTER_FEE,
  };
}
