"use client";

import { ChartFrame } from "@repo/ui/components/charts/chart-frame";
import type {
  BarChart as BarChartImpl,
  DonutChart as DonutChartImpl,
  LineChart as LineChartImpl,
} from "@repo/ui/components/charts";
import { lazy, Suspense, type ComponentProps } from "react";

// recharts is 407 KB raw / 118 KB gzip and it reaches every screen that draws a
// chart — 19% of the teacher dashboard's first load. The data these charts
// render is fetched client-side anyway, so the chunk downloads in parallel with
// that request and costs no perceived delay. The fallback is ChartFrame's own
// loading state at the caller's height, so nothing shifts when it lands.
// This app draws no heatmap; only the three recharts-backed charts are wrapped.

const BarChartLazy = lazy(() =>
  import("@repo/ui/components/charts/bar-chart").then((m) => ({ default: m.BarChart })),
);
const DonutChartLazy = lazy(() =>
  import("@repo/ui/components/charts/donut-chart").then((m) => ({ default: m.DonutChart })),
);
const LineChartLazy = lazy(() =>
  import("@repo/ui/components/charts/line-chart").then((m) => ({ default: m.LineChart })),
);

export function BarChart(props: ComponentProps<typeof BarChartImpl>) {
  return (
    <Suspense fallback={<ChartFrame loading height={props.height} />}>
      <BarChartLazy {...props} />
    </Suspense>
  );
}

export function DonutChart(props: ComponentProps<typeof DonutChartImpl>) {
  return (
    <Suspense fallback={<ChartFrame loading height={props.height} />}>
      <DonutChartLazy {...props} />
    </Suspense>
  );
}

export function LineChart(props: ComponentProps<typeof LineChartImpl>) {
  return (
    <Suspense fallback={<ChartFrame loading height={props.height} />}>
      <LineChartLazy {...props} />
    </Suspense>
  );
}


