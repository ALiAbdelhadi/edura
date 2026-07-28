"use client";

import React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltip } from "./chart-tooltip";
import { ChartLegend } from "./chart-legend";

export type LineSeriesPoint = {
  x: string;
  value: number;
};

export type LineSeries = {
  id: string;
  label: string;
  color: string;
  points: LineSeriesPoint[];
};

type LineChartProps = {
  series: LineSeries[];
  height?: number;
  yTickCount?: number;
  showArea?: boolean;
  yValueFormatter?: (value: number) => string;
  emptyText?: string;
};

const tickStyle = {
  fontSize: 10,
  fill: "var(--ink-3)",
  fontFamily: "var(--font-mono)",
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
  emptyText = "No chart data available.",
}: LineChartProps) {
  const hasData = series.some((line) => line.points.length > 0);
  const data = React.useMemo(() => mergeSeries(series), [series]);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  const valueFormatter = (value: number) =>
    yValueFormatter ? yValueFormatter(value) : String(value);

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {/* No gradient defs. الدفتر removes gradient-as-decoration: a fade
              implies the data thins out toward the axis, which it does not.
              The area is a flat, low-opacity wash of the series colour. */}
          <CartesianGrid stroke="var(--rule)" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="x" tick={tickStyle} tickLine={false} axisLine={false} />
          <YAxis
            tick={tickStyle}
            tickLine={false}
            axisLine={false}
            tickCount={yTickCount}
            tickFormatter={valueFormatter}
          />
          <Tooltip
            cursor={{ stroke: "var(--rule)" }}
            content={<ChartTooltip valueFormatter={valueFormatter} />}
          />
          {series.map((line) => (
            <Area
              key={line.id}
              type="monotone"
              dataKey={line.id}
              name={line.label}
              stroke={line.color}
              strokeWidth={2.5}
              fill={showArea ? line.color : "transparent"}
              fillOpacity={showArea ? 0.1 : 0}
              dot={{ r: 3, fill: "var(--sheet)", stroke: line.color, strokeWidth: 2 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <ChartLegend
        items={series.map((line) => ({ key: line.id, label: line.label, color: line.color }))}
      />
    </div>
  );
}
