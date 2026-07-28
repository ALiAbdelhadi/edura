"use client";

import * as React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { TRACK_COLOR } from "./chart-frame";

export function ProgressArcChart({
  percent,
  height = 220,
  color = "var(--teal)",
  trackColor = TRACK_COLOR,
  label,
  subLabel,
}: {
  percent: number;
  height?: number;
  color?: string;
  trackColor?: string;
  label?: React.ReactNode;
  subLabel?: React.ReactNode;
}) {
  const boundedPercent = Math.max(0, Math.min(100, Math.round(percent)));
  const data = [
    { key: "value", value: boundedPercent },
    { key: "remainder", value: 100 - boundedPercent },
  ];

  return (
    <div className="relative" style={{ height }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            startAngle={180}
            endAngle={0}
            cy="82%"
            innerRadius="70%"
            outerRadius="100%"
            cornerRadius={8}
            stroke="none"
            isAnimationActive={false}
          >
            <Cell key="value" fill={color} />
            <Cell key="remainder" fill={trackColor} />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 pt-[18%] text-center">
        <span className="num text-4xl font-semibold text-ink">{boundedPercent}%</span>
        {label ? <span className="text-sm text-ink-2">{label}</span> : null}
        {subLabel ? <span className="text-xs text-ink-3">{subLabel}</span> : null}
      </div>
    </div>
  );
}
