/* Shim. The chart wrappers live in `@repo/ui/components/charts` — series colours
   come from the token layer there, so the two apps cannot drift into two palettes.

   Re-exports only what erp renders. The package exports more — `ChartFrame`,
   `ChartLegend`, `ChartTooltip`, `ProgressArcChart`, `SERIES_COLORS`,
   `TRACK_COLOR`, `seriesColor` and the series types — and anything that comes to
   need one should import it from `@repo/ui` directly rather than widen this list
   again.

   `HeatmapCalendar` is the one wrapper that is NOT a bare re-export: it needs an
   accessible name, and @repo/ui carries no i18n runtime, so the string is
   injected in ./heatmap-calendar. That is the general pattern for promoted
   components that carry copy. */
export { BarChart, DonutChart, LineChart } from "@repo/ui/components/charts";

export { HeatmapCalendar } from "./heatmap-calendar";
