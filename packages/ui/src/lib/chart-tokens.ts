/**
 * الدفتر / The Ledger — chart tokens.
 *
 * Charts are the one place a design system leaks, because a charting library
 * wants runtime colour VALUES and a token layer speaks in CSS custom
 * properties. The leak here was real: a 7-hue palette was hardcoded in
 * `lib/analytics/transforms.ts` and duplicated again in a student screen, so
 * charts rendered in colours that existed nowhere else in the product — the
 * donut on the center dashboard was purple and sky-blue while the rest of the
 * page was indigo and teal.
 *
 * This module is the single bridge. Every value is a `var()` reference, which
 * SVG attributes resolve natively, so charts follow the theme (including the
 * light/dark flip) without any JS reading computed styles.
 *
 * It lives in `packages/ui` deliberately: if each portal session fixed its own
 * charts, the result would be five palettes.
 *
 * ── COLOUR DISCIPLINE (enforce in review) ──────────────────────────────────
 *   teal   = money out / confirmed        amber = waiting
 *   red    = irreversible or blocking     indigo = brand and primary metric
 *   ink-3  = the neutral comparison series
 * A series is never coloured for decoration, and never two saturated colours
 * in the same chart unless they encode genuinely opposed states.
 */

/**
 * Semantic series colours. Prefer these over the indexed ramp — a named series
 * ("revenue", "paid") should say what it means, not take whatever hue index 3
 * happens to be.
 */
export const CHART_COLOR = {
  /** Money confirmed or moving out. The default for any currency series. */
  money: "var(--teal)",
  /** Brand / the primary non-money metric (rates, scores, counts). */
  brand: "var(--indigo)",
  /** Awaiting, pending, overdue. */
  waiting: "var(--amber)",
  /** The neutral comparison series — the grey bar a coloured one sits against. */
  neutral: "var(--ink-3)",
  /** Blocking, failed, reversed. Use sparingly; red is a claim. */
  blocking: "var(--red)",
} as const

/**
 * Indexed ramp, for categorical series whose count is not known ahead of time
 * (a donut over N statuses). Ordered by semantic weight, not rainbow order, so
 * the first and most prominent slice is the money-coloured one.
 *
 * Five entries, not seven: beyond five categories a donut is unreadable and
 * the honest fix is to group the tail into "أخرى / Other", not to invent a
 * sixth hue.
 */
export const CHART_SERIES = [
  "var(--chart-1)", // teal
  "var(--chart-2)", // indigo
  "var(--chart-3)", // amber
  "var(--chart-4)", // ink-3
  "var(--chart-5)", // red
] as const

/** Pick from the ramp, wrapping. */
export function seriesColor(index: number): string {
  return CHART_SERIES[index % CHART_SERIES.length]!
}

/** Gridlines: 1px --rule, dashed 2 4. Per Handoff I §4. */
export const CHART_GRID = {
  stroke: "var(--rule)",
  strokeDasharray: "2 4",
  strokeWidth: 1,
} as const

/** Axis labels: mono 10, --ink-3. Figures are mono everywhere, axes included. */
export const CHART_AXIS_TICK = {
  fill: "var(--ink-3)",
  fontSize: 10,
  fontFamily: "var(--font-mono)",
} as const

/**
 * Chart wrappers render inside `dir="ltr"` while the card around them stays
 * RTL — recharts' axis math assumes LTR, and a time axis reads left-to-right
 * for every reader because a chart is a diagram, not prose. See
 * design/DECISIONS.md D-11.
 */
export const CHART_DIR = "ltr" as const
