/**
 * Chart colours — ONE source for this portal.
 *
 * The screens previously reached for `--chart-1..5`, `--brand-teal`, `--info`,
 * `--warning`, `--success` and `--primary` directly: seven decorative hues from
 * the superseded Deep Trust palette, picked per screen. Under the Ledger a
 * figure is never coloured for decoration, and never two saturated colours in
 * one row.
 *
 * The rule, from the spec:
 *   - the series that IS money → --money (teal)
 *   - the series it is measured against ("of total", gross) → --rule grey
 *   - money leaving → --red
 *   - waiting → --amber
 *   - a neutral count → --indigo
 *
 * `CATEGORICAL` exists only for genuinely unordered breakdowns (expense
 * categories), where there is no semantic meaning to encode. It stays muted on
 * purpose — a donut of expense categories is reference, not a decision.
 *
 * NOTE: `lib/analytics/transforms.ts` still hardcodes its own 7-hue palette and
 * is shared with other portals, so it is not this session's to change. Screens
 * here pass colours explicitly rather than relying on that default.
 */
export const CHART = {
  money: "var(--money)",
  against: "var(--rule)",
  out: "var(--red)",
  waiting: "var(--amber)",
  count: "var(--indigo)",
} as const;

/** Unordered breakdowns only. Ordered so adjacent slices stay distinguishable. */
export const CATEGORICAL = [
  "var(--indigo)",
  "var(--teal)",
  "var(--amber)",
  "var(--ink-3)",
  "var(--red)",
  "var(--indigo-soft)",
  "var(--teal-soft)",
] as const;

/** Gridlines, axis labels and the LTR island rule — applied by the wrappers. */
export const CHART_GRID = {
  stroke: "var(--rule)",
  dash: "2 4",
  labelColor: "var(--ink-3)",
  labelSize: 10,
} as const;
