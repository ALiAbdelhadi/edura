export const CHART_COLOR = {
  money: "var(--teal)",
  brand: "var(--indigo)",
  waiting: "var(--amber)",
  neutral: "var(--ink-3)",
  blocking: "var(--red)",
} as const

export const CHART_SERIES = [
  "var(--chart-1)", // teal
  "var(--chart-2)", // indigo
  "var(--chart-3)", // amber
  "var(--chart-4)", // ink-3
  "var(--chart-5)", // red
] as const

export function seriesColor(index: number): string {
  return CHART_SERIES[index % CHART_SERIES.length]!
}

export const CHART_GRID = {
  stroke: "var(--rule)",
  strokeDasharray: "2 4",
  strokeWidth: 1,
} as const

export const CHART_AXIS_TICK = {
  fill: "var(--ink-3)",
  fontSize: 10,
  fontFamily: "var(--font-mono)",
} as const

export const CHART_DIR = "ltr" as const
