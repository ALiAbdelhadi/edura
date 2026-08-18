import { describe, it, expect } from "vitest";
import {
  studentSteps,
  stepAfterGrade,
  stepAfterSystem,
  stepAfterTrack,
} from "@/features/onboarding/steps";

// The wizard's skipping rules are pure functions of catalog DATA (grade has
// track links? stage asks for a 2nd language?) — no system/track names appear
// anywhere here, which is exactly the PRD §1 config-driven requirement.
describe("student wizard step flow — PRD §4/§10", () => {
  it("primary-like selection (no tracks, no 2nd language): 4 steps, no track/lang", () => {
    expect(studentSteps({ needsTrack: false, needsLang: false })).toEqual([
      "system",
      "stage",
      "grade",
      "review",
    ]);
  });

  it("secondary-2/3-like selection (tracks + 2nd language): full 6 steps", () => {
    expect(studentSteps({ needsTrack: true, needsLang: true })).toEqual([
      "system",
      "stage",
      "grade",
      "track",
      "secondLanguage",
      "review",
    ]);
  });

  it("AC: a grade with no track links goes straight past the track step (bacc تمهيدي / أولى ثانوي)", () => {
    expect(stepAfterGrade({ gradeHasTracks: false, stageHasLang: false })).toBe("review");
    expect(stepAfterGrade({ gradeHasTracks: false, stageHasLang: true })).toBe("secondLanguage");
  });

  it("AC: a grade WITH track links must pass through the track step (تانية/تالتة)", () => {
    expect(stepAfterGrade({ gradeHasTracks: true, stageHasLang: true })).toBe("track");
    expect(stepAfterGrade({ gradeHasTracks: true, stageHasLang: false })).toBe("track");
  });

  it("after track: 2nd-language step only when the stage asks for it", () => {
    expect(stepAfterTrack({ stageHasLang: true })).toBe("secondLanguage");
    expect(stepAfterTrack({ stageHasLang: false })).toBe("review");
  });

  it("single-stage systems (بكالوريا) skip the stage screen", () => {
    expect(stepAfterSystem({ stageCount: 1 })).toBe("grade");
    expect(stepAfterSystem({ stageCount: 3 })).toBe("stage");
  });
});
