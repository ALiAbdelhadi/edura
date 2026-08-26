export const CHART = {
  money: "var(--money)",
  against: "var(--rule)",
  out: "var(--red)",
  waiting: "var(--amber)",
  count: "var(--indigo)",
} as const;

export const CATEGORICAL = [
  "var(--indigo)",
  "var(--teal)",
  "var(--amber)",
  "var(--ink-3)",
  "var(--red)",
  "var(--indigo-soft)",
  "var(--teal-soft)",
] as const;

export const CHART_GRID = {
  stroke: "var(--rule)",
  dash: "2 4",
  labelColor: "var(--ink-3)",
  labelSize: 10,
} as const;
