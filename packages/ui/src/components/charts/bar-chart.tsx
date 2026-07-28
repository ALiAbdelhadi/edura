"use client";

import * as React from "react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AXIS_TICK, ChartFrame, GRID, seriesColor, type ChartState } from "./chart-frame";
import { ChartLegend } from "./chart-legend";
import { ChartTooltip } from "./chart-tooltip";

/** `color` optional — omit for the semantic palette slot. */
export type BarSeries = { key: string; label: string; color?: string };
export type BarDatum = { label: string; [key: string]: string | number };

function truncateLabel(value: string, max = 16) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function BarChart({
  data,
  series,
  height = 280,
  horizontal = false,
  stacked = false,
  yValueFormatter,
  emptyText = "—",
  error,
  loading,
  loadingText,
}: {
  data: BarDatum[];
  series: BarSeries[];
  height?: number;
  horizontal?: boolean;
  stacked?: boolean;
  yValueFormatter?: (value: number) => string;
  emptyText?: React.ReactNode;
} & Omit<ChartState, "isEmpty" | "emptyText" | "height">) {
  const resolved = series.map((s, i) => ({ ...s, color: s.color ?? seriesColor(i) }));
  const valueFormatter = (value: number) =>
    yValueFormatter ? yValueFormatter(value) : String(value);

  return (
    <div>
      <ChartFrame
        isEmpty={data.length === 0 || series.length === 0}
        error={error}
        loading={loading}
        loadingText={loadingText}
        emptyText={emptyText}
        height={height}
      >
        <ResponsiveContainer width="100%" height={height}>
          <RechartsBarChart
            data={data}
            layout={horizontal ? "vertical" : "horizontal"}
            margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            barGap={4}
            barCategoryGap={stacked ? "24%" : "30%"}
          >
            <CartesianGrid {...GRID} horizontal={!horizontal} vertical={horizontal} />
            {horizontal ? (
              <>
                <XAxis
                  type="number"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={valueFormatter}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={110}
                  tickFormatter={(value: string) => truncateLabel(value, 14)}
                />
              </>
            ) : (
              <>
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: string) => truncateLabel(value, 10)}
                />
                <YAxis
                  type="number"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={valueFormatter}
                />
              </>
            )}
            <Tooltip
              cursor={{ fill: "var(--rule-2)", opacity: 0.6 }}
              content={<ChartTooltip valueFormatter={valueFormatter} />}
            />
            {resolved.map((entry, index) => {
              const isOuterSegment = !stacked || index === resolved.length - 1;
              const radius: [number, number, number, number] = isOuterSegment
                ? horizontal
                  ? [0, 4, 4, 0]
                  : [4, 4, 0, 0]
                : [0, 0, 0, 0];
              return (
                <Bar
                  key={entry.key}
                  dataKey={entry.key}
                  name={entry.label}
                  fill={entry.color}
                  stackId={stacked ? "stack" : undefined}
                  radius={radius}
                  maxBarSize={horizontal ? undefined : 40}
                />
              );
            })}
          </RechartsBarChart>
        </ResponsiveContainer>
      </ChartFrame>
      {data.length && series.length && !error && !loading ? (
        <ChartLegend items={resolved} />
      ) : null}
    </div>
  );
}
