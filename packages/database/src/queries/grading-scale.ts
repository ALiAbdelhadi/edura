// ===========================================================================
// التقديرات — THE GRADING SCALE.
//
// What an Egyptian parent reads on a report is a percentage and a تقدير:
//
//        ٨٧٪  ·  ممتاز
//
// Not "B-", and not a 2.7. This module is the ONE ladder that turns a
// percentage into that word, for every surface that shows a grade: the
// student's own screen, the parent's progress screen, the student dashboard
// API, the teacher's gradebook, and any center report that comes later.
//
// ── WHY THIS FILE EXISTS AT ALL ────────────────────────────────────────────
//
// Before it there were FOUR copies of a US A–F ladder — in the student
// screen, the parent screen, the dashboard route and the gradebook — and
// they had already drifted apart: the parent's copy floored at "D" and had
// no failing band, so a child at 12% and a child at 61% were both shown the
// same letter. That is the whole argument for a single table. A grade is a
// thing a family argues with a center about; two screens must not be able to
// answer it differently.
//
// ── THE BANDS, AND WHY THESE CUT-OFFS ──────────────────────────────────────
//
// This is the ladder Egyptian schools, centers and universities actually
// use, and the one a parent here can read without translation:
//
//        ممتاز      ≥ 85
//        جيد جدًا    ≥ 75
//        جيد        ≥ 65
//        مقبول      ≥ 50
//        ضعيف      < 50
//
// 50 is the pass mark, which is why `PASS_PERCENT` is named rather than
// spelled `>= 50` at each call site — a center that later needs a different
// floor changes it in one place, and no screen is left behind.
//
// ── NO GPA, DELIBERATELY ───────────────────────────────────────────────────
//
// A 4.0 GPA was being computed by averaging letters that had themselves been
// derived from percentages: two lossy conversions away from the record, to
// produce a number that means nothing to an Egyptian family. The percentage
// is the figure the marks actually support, so the percentage is what the
// screens carry, with the تقدير beside it as the word.
//
// ── THE BAND IS DERIVED, NEVER STORED ──────────────────────────────────────
//
// `grades.score` / `maxScore` stay the truth in the database. The band is
// computed from them on the way out. So moving a cut-off changes what today
// reports, and never rewrites what a teacher recorded last term.
//
// ── LABELS ARE NOT HERE ────────────────────────────────────────────────────
//
// This module returns an `id`; `messages/{ar,en}/*.json` own the words under
// `gradeBands.*`. The ladder is domain, the wording is language, and putting
// the Arabic in here would put it out of reach of the one place translators
// look. `tone` is here rather than in each component for the same reason a
// single ladder is: ممتاز must be the same colour on every screen.
//
// Dependency-free on purpose — the browser screens and the server routes
// import the same file, exactly like `student-code`.
// ===========================================================================

export type GradeBandId = "excellent" | "very_good" | "good" | "pass" | "weak";

export type GradeBand = {
  readonly id: GradeBandId;
  /** Inclusive floor, as a percentage of the assessment's total mark. */
  readonly minPercent: number;
  /**
   * The value a five-point تقدير assessment stores in `grades.score`
   * (`gradeType: "letter"`, `maxScore: 4`). 4 = ممتاز … 0 = ضعيف, which is
   * the mapping already in the database — this only renames what it is
   * called on screen, so no stored row changes meaning.
   */
  readonly ordinal: 0 | 1 | 2 | 3 | 4;
  /** Semantic tone, so one band is one colour everywhere. */
  readonly tone: "success" | "info" | "neutral" | "warning" | "danger";
};

/** The pass mark. Below it a student has not passed the subject. */
export const PASS_PERCENT = 50;

/** Ordered HIGH → LOW; `bandForPercent` relies on that order. */
export const GRADE_BANDS: readonly GradeBand[] = [
  { id: "excellent", minPercent: 85, ordinal: 4, tone: "success" },
  { id: "very_good", minPercent: 75, ordinal: 3, tone: "info" },
  { id: "good", minPercent: 65, ordinal: 2, tone: "neutral" },
  { id: "pass", minPercent: PASS_PERCENT, ordinal: 1, tone: "warning" },
  { id: "weak", minPercent: 0, ordinal: 0, tone: "danger" },
] as const;

/** The lowest band — what an out-of-range or missing percentage resolves to. */
const WEAK = GRADE_BANDS[GRADE_BANDS.length - 1] as GradeBand;

/**
 * The تقدير for a percentage. Total-ordered and never null: a percentage
 * always has a band, so no caller needs a fallback branch that could drift
 * from this table.
 */
export function bandForPercent(pct: number): GradeBand {
  if (!Number.isFinite(pct)) return WEAK;
  for (const band of GRADE_BANDS) {
    if (pct >= band.minPercent) return band;
  }
  return WEAK;
}

/**
 * The تقدير a five-point assessment stored directly (score 0–4), for the
 * gradebook where the teacher picked the word rather than a mark.
 * Returns null for anything outside 0–4, so a numeric assessment is never
 * mistaken for a تقدير one.
 */
export function bandForOrdinal(score: number): GradeBand | null {
  return GRADE_BANDS.find((b) => b.ordinal === score) ?? null;
}

/** Did this percentage pass? One definition, so no screen invents its own. */
export function isPassing(pct: number): boolean {
  return Number.isFinite(pct) && pct >= PASS_PERCENT;
}

/**
 * Percentage from a raw mark. Guards `maxScore = 0`, which the gradebook
 * cannot produce today but a manual/imported row could, and which would
 * otherwise reach the screens as `Infinity` or `NaN`.
 */
export function percentOf(score: number, maxScore: number): number {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) return 0;
  return Math.round((score / maxScore) * 100);
}
