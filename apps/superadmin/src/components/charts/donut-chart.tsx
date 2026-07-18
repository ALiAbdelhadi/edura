"use client";

import React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartTooltip } from "./chart-tooltip";

export type DonutSlice = {
  id: string;
  label: string;
  value: number;
  color: string;
};

type DonutChartProps = {
  data: DonutSlice[];
  height?: number;
  innerRadiusRatio?: number;
  centerLabel?: string;
  emptyText?: string;
  formatValue?: (value: number) => string;
};

export function DonutChart({
  data,
  height = 260,
  innerRadiusRatio = 0.62,
  centerLabel,
  emptyText = "No chart data available.",
  formatValue = (value: number) => value.toLocaleString(),
}: DonutChartProps) {
  const total = data.reduce((sum, slice) => sum + slice.value, 0);

  if (total <= 0) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  const innerRadius = `${Math.round(76 * innerRadiusRatio)}%`;

  return (
    <div>
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<ChartTooltip valueFormatter={formatValue} />} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={innerRadius}
              outerRadius="76%"
              paddingAngle={data.length > 1 ? 2 : 0}
              cornerRadius={4}
              stroke="var(--card)"
              strokeWidth={2}
            >
              {data.map((slice) => (
                <Cell key={slice.id} fill={slice.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-foreground">{formatValue(total)}</span>
          {centerLabel ? (
            <span className="text-xs text-muted-foreground">{centerLabel}</span>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {data.map((slice) => (
          <div key={slice.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: slice.color }}
              />
              <span className="truncate">{slice.label}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-foreground">
              {formatValue(slice.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
