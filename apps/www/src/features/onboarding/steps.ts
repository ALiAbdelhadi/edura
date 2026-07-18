// Pure step-flow rules for the student wizard (§4) — extracted so the
// data-driven skipping logic (track step only when the grade offers tracks,
// second-language step only when the stage asks for one) is unit-testable.

export type StudentStepId = "system" | "stage" | "grade" | "track" | "secondLanguage" | "review";

export function studentSteps(opts: { needsTrack: boolean; needsLang: boolean }): StudentStepId[] {
  const steps: StudentStepId[] = ["system", "stage", "grade"];
  if (opts.needsTrack) steps.push("track");
  if (opts.needsLang) steps.push("secondLanguage");
  steps.push("review");
  return steps;
}

/** Where the wizard lands after picking a grade. */
export function stepAfterGrade(opts: { gradeHasTracks: boolean; stageHasLang: boolean }): StudentStepId {
  if (opts.gradeHasTracks) return "track";
  if (opts.stageHasLang) return "secondLanguage";
  return "review";
}

/** Where the wizard lands after picking a track. */
export function stepAfterTrack(opts: { stageHasLang: boolean }): StudentStepId {
  return opts.stageHasLang ? "secondLanguage" : "review";
}

/** Where the wizard lands after picking a system (single-stage systems skip the stage step). */
export function stepAfterSystem(opts: { stageCount: number }): StudentStepId {
  return opts.stageCount === 1 ? "grade" : "stage";
}
