export type GradeBandId = "excellent" | "very_good" | "good" | "pass" | "weak";

export type GradeBand = {
  readonly id: GradeBandId;
  readonly minPercent: number;
  readonly ordinal: 0 | 1 | 2 | 3 | 4;
  readonly tone: "success" | "info" | "neutral" | "warning" | "danger";
};

export const PASS_PERCENT = 50;

export const GRADE_BANDS: readonly GradeBand[] = [
  { id: "excellent", minPercent: 85, ordinal: 4, tone: "success" },
  { id: "very_good", minPercent: 75, ordinal: 3, tone: "info" },
  { id: "good", minPercent: 65, ordinal: 2, tone: "neutral" },
  { id: "pass", minPercent: PASS_PERCENT, ordinal: 1, tone: "warning" },
  { id: "weak", minPercent: 0, ordinal: 0, tone: "danger" },
] as const;

const WEAK = GRADE_BANDS[GRADE_BANDS.length - 1] as GradeBand;

export function bandForPercent(pct: number): GradeBand {
  if (!Number.isFinite(pct)) return WEAK;
  for (const band of GRADE_BANDS) {
    if (pct >= band.minPercent) return band;
  }
  return WEAK;
}

export function bandForOrdinal(score: number): GradeBand | null {
  return GRADE_BANDS.find((b) => b.ordinal === score) ?? null;
}

export function isPassing(pct: number): boolean {
  return Number.isFinite(pct) && pct >= PASS_PERCENT;
}

export function percentOf(score: number, maxScore: number): number {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) return 0;
  return Math.round((score / maxScore) * 100);
}
