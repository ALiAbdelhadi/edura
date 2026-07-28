/* Shim. The chart wrappers live in `@repo/ui/components/charts` — series colours come
   from the token layer there, so the two apps cannot drift into two palettes.
   Kept as a re-export so no call site changed.

   `HeatmapCalendar` is the one wrapper that is NOT a bare re-export: it needs an
   accessible name, and @repo/ui has no i18n runtime, so the string is injected here.
   That is the general pattern for promoted components that carry copy. */
export {
  LineChart,
  BarChart,
  DonutChart,
  ProgressArcChart,
  ChartLegend,
  ChartTooltip,
  ChartFrame,
  SERIES_COLORS,
  seriesColor,
  TRACK_COLOR,
  type LineSeries,
  type LineSeriesPoint,
  type BarSeries,
  type BarDatum,
  type DonutSlice,
  type HeatmapCell,
} from "@repo/ui/components/charts";

export { HeatmapCalendar } from "./heatmap-calendar";
