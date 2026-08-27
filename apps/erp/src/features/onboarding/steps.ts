export type StudentStepId = "system" | "stage" | "grade" | "track" | "secondLanguage" | "review";

export function studentSteps(opts: { needsTrack: boolean; needsLang: boolean }): StudentStepId[] {
  const steps: StudentStepId[] = ["system", "stage", "grade"];
  if (opts.needsTrack) steps.push("track");
  if (opts.needsLang) steps.push("secondLanguage");
  steps.push("review");
  return steps;
}

export function stepAfterGrade(opts: { gradeHasTracks: boolean; stageHasLang: boolean }): StudentStepId {
  if (opts.gradeHasTracks) return "track";
  if (opts.stageHasLang) return "secondLanguage";
  return "review";
}

export function stepAfterTrack(opts: { stageHasLang: boolean }): StudentStepId {
  return opts.stageHasLang ? "secondLanguage" : "review";
}

export function stepAfterSystem(opts: { stageCount: number }): StudentStepId {
  return opts.stageCount === 1 ? "grade" : "stage";
}
