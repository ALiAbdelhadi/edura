// SSOT for one rule: a second-foreign-language subject belongs to a student ONLY
// if it is the exact language they picked at onboarding. Every other language in
// the grade's offerings (French / German / Italian / Spanish) is somebody else's
// subject and must never show in that student's own list.
//
// Pure + client-safe on purpose: the onboarding review preview and the server-side
// `mine=1` subjects list both consume it, so the preview can never disagree with
// what the student actually gets.

/** A student who skipped the step (null) keeps NO second language. */
export function filterStudentSecondLanguage<T extends { id: string; isSecondLanguage: boolean }>(
  subjects: T[],
  secondLanguageSubjectId: string | null | undefined,
): T[] {
  return subjects.filter((s) => !s.isSecondLanguage || s.id === secondLanguageSubjectId);
}
