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

const tickStyle = { fontSize: 12, fill: "var(--muted-foreground)" };

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
          <defs>
            {series.map((line) => (
              <linearGradient
                key={line.id}
                id={`line-gradient-${line.id}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={line.color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={line.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="x" tick={tickStyle} tickLine={false} axisLine={false} />
          <YAxis
            tick={tickStyle}
            tickLine={false}
            axisLine={false}
            tickCount={yTickCount}
            tickFormatter={valueFormatter}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
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
              fill={showArea ? `url(#line-gradient-${line.id})` : "transparent"}
              dot={{ r: 3, fill: "var(--card)", stroke: line.color, strokeWidth: 2 }}
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
