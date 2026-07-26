export function filterStudentSecondLanguage<T extends { id: string; isSecondLanguage: boolean }>(
  subjects: T[],
  secondLanguageSubjectId: string | null | undefined,
): T[] {
  return subjects.filter((s) => !s.isSecondLanguage || s.id === secondLanguageSubjectId);
}
