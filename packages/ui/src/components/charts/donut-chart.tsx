"use client";

import * as React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { ChartFrame, seriesColor, type ChartState } from "./chart-frame";
import { ChartTooltip } from "./chart-tooltip";

/** `color` optional — omit for the semantic palette slot. */
export type DonutSlice = { id: string; label: string; value: number; color?: string };

export function DonutChart({
  data,
  height = 260,
  innerRadiusRatio = 0.62,
  centerLabel,
  emptyText = "—",
  formatValue = (value: number) => value.toLocaleString(),
  error,
  loading,
  loadingText,
}: {
  data: DonutSlice[];
  height?: number;
  innerRadiusRatio?: number;
  centerLabel?: React.ReactNode;
  emptyText?: React.ReactNode;
  formatValue?: (value: number) => string;
} & Omit<ChartState, "isEmpty" | "emptyText" | "height">) {
  const total = data.reduce((sum, slice) => sum + slice.value, 0);
  const resolved = data.map((s, i) => ({ ...s, color: s.color ?? seriesColor(i) }));
  const innerRadius = `${Math.round(76 * innerRadiusRatio)}%`;

  return (
    <div>
      <ChartFrame
        isEmpty={total <= 0}
        error={error}
        loading={loading}
        loadingText={loadingText}
        emptyText={emptyText}
        height={height}
      >
        <div className="relative" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip content={<ChartTooltip valueFormatter={formatValue} />} />
              <Pie
                data={resolved}
                dataKey="value"
                nameKey="label"
                innerRadius={innerRadius}
                outerRadius="76%"
                paddingAngle={resolved.length > 1 ? 2 : 0}
                cornerRadius={4}
                stroke="var(--sheet)"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {resolved.map((slice) => (
                  <Cell key={slice.id} fill={slice.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="num text-3xl font-semibold text-ink">{formatValue(total)}</span>
            {centerLabel ? <span className="text-xs text-ink-2">{centerLabel}</span> : null}
          </div>
        </div>
      </ChartFrame>
      {total > 0 && !error && !loading ? (
        // The slice list sits OUTSIDE the LTR island so it follows the page direction —
        // only the plot geometry needs to be physical.
        <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {resolved.map((slice) => (
            <div key={slice.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5 text-ink-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: slice.color }}
                />
                <span className="truncate">{slice.label}</span>
              </span>
              <span className="num shrink-0 font-medium text-ink">
                {formatValue(slice.value)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
