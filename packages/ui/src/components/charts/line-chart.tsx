"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AXIS_TICK, ChartFrame, GRID, seriesColor, type ChartState } from "./chart-frame";
import { ChartLegend } from "./chart-legend";
import { ChartTooltip } from "./chart-tooltip";

export type LineSeriesPoint = { x: string; value: number };
/** `color` is OPTIONAL. Omit it and the series takes its semantic slot from the token
    palette — that is what stops callers reaching for literal hexes. */
export type LineSeries = {
  id: string;
  label: string;
  color?: string;
  points: LineSeriesPoint[];
};

function mergeSeries(series: LineSeries[]) {
  const xValues = Array.from(
    new Set(series.flatMap((line) => line.points.map((point) => point.x))),
  );
  return xValues.map((x) => {
    const row: Record<string, string | number> = { x };
    for (const line of series) {
      const point = line.points.find((entry) => entry.x === x);
      if (point) row[line.id] = point.value;
    }
    return row;
  });
}

export function LineChart({
  series,
  height = 260,
  yTickCount = 5,
  showArea = false,
  yValueFormatter,
  emptyText = "—",
  error,
  loading,
  loadingText,
}: {
  series: LineSeries[];
  height?: number;
  yTickCount?: number;
  showArea?: boolean;
  yValueFormatter?: (value: number) => string;
  emptyText?: React.ReactNode;
} & Omit<ChartState, "isEmpty" | "emptyText" | "height">) {
  const hasData = series.some((line) => line.points.length > 0);
  const data = React.useMemo(() => mergeSeries(series), [series]);
  const resolved = series.map((line, i) => ({ ...line, color: line.color ?? seriesColor(i) }));
  const valueFormatter = (value: number) =>
    yValueFormatter ? yValueFormatter(value) : String(value);

  return (
    <div>
      <ChartFrame
        isEmpty={!hasData}
        error={error}
        loading={loading}
        loadingText={loadingText}
        emptyText={emptyText}
        height={height}
      >
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              {resolved.map((line) => (
                <linearGradient
                  key={line.id}
                  id={`line-gradient-${line.id}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={line.color} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={line.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid {...GRID} vertical={false} />
            <XAxis dataKey="x" tick={AXIS_TICK} tickLine={false} axisLine={false} />
            <YAxis
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickCount={yTickCount}
              tickFormatter={valueFormatter}
            />
            <Tooltip
              cursor={{ stroke: "var(--rule)" }}
              content={<ChartTooltip valueFormatter={valueFormatter} />}
            />
            {resolved.map((line) => (
              <Area
                key={line.id}
                type="monotone"
                dataKey={line.id}
                name={line.label}
                stroke={line.color}
                strokeWidth={2}
                fill={showArea ? `url(#line-gradient-${line.id})` : "transparent"}
                dot={{ r: 3, fill: "var(--sheet)", stroke: line.color, strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </ChartFrame>
      {hasData && !error && !loading ? (
        <ChartLegend
          items={resolved.map((line) => ({
            key: line.id,
            label: line.label,
            color: line.color,
          }))}
        />
      ) : null}
    </div>
  );
}
