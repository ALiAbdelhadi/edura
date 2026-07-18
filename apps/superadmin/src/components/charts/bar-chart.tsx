"use client";

import React from "react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltip } from "./chart-tooltip";
import { ChartLegend } from "./chart-legend";

export type BarSeries = {
  key: string;
  label: string;
  color: string;
};

export type BarDatum = {
  label: string;
  [key: string]: string | number;
};

type BarChartProps = {
  data: BarDatum[];
  series: BarSeries[];
  height?: number;
  horizontal?: boolean;
  stacked?: boolean;
  yValueFormatter?: (value: number) => string;
  emptyText?: string;
};

const tickStyle = { fontSize: 12, fill: "var(--muted-foreground)" };

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
  emptyText = "No chart data available.",
}: BarChartProps) {
  if (data.length === 0 || series.length === 0) {
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
        <RechartsBarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
          barGap={4}
          barCategoryGap={stacked ? "24%" : "30%"}
        >
          <CartesianGrid
            stroke="var(--border)"
            strokeDasharray="3 3"
            horizontal={!horizontal}
            vertical={horizontal}
          />
          {horizontal ? (
            <>
              <XAxis
                type="number"
                tick={tickStyle}
                tickLine={false}
                axisLine={false}
                tickFormatter={valueFormatter}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={tickStyle}
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
                tick={tickStyle}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: string) => truncateLabel(value, 10)}
              />
              <YAxis
                type="number"
                tick={tickStyle}
                tickLine={false}
                axisLine={false}
                tickFormatter={valueFormatter}
              />
            </>
          )}
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={<ChartTooltip valueFormatter={valueFormatter} />}
          />
          {series.map((entry, index) => {
            const isOuterSegment = !stacked || index === series.length - 1;
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
      <ChartLegend items={series} />
    </div>
  );
}
