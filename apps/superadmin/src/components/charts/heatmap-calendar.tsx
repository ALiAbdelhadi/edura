"use client";

import React from "react";

export type HeatmapCell = {
  date: string;
  value: number;
  label: string;
};

type HeatmapCalendarProps = {
  cells: HeatmapCell[];
  columns?: number;
  height?: number;
  emptyText?: string;
};

/** Attendance heatmaps encode a status (present/late/absent), not a continuous
 * magnitude, so cells use the same status tokens as the legend below them. */
function cellColor(value: number) {
  if (value >= 80) return "var(--success)";
  if (value >= 40) return "var(--warning)";
  return "var(--destructive)";
}

export function HeatmapCalendar({
  cells,
  columns = 7,
  emptyText = "No chart data available.",
}: HeatmapCalendarProps) {
  if (cells.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      role="img"
      aria-label="calendar heatmap"
    >
      {cells.map((cell) => (
        <div
          key={cell.date}
          title={cell.label}
          className="flex aspect-square items-center justify-center rounded-md text-[11px] font-medium text-white"
          style={{ background: cellColor(cell.value) }}
        >
          {cell.label}
        </div>
      ))}
    </div>
  );
}
