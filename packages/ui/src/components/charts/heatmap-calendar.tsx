"use client";

import * as React from "react";

import { ChartFrame, type ChartState } from "./chart-frame";

export type HeatmapCell = { date: string; value: number; label: string };

/** Attendance heatmaps encode a STATUS (present / late / absent), not a continuous
    magnitude, so cells use the same three semantic tokens as every other status in the
    product rather than a gradient ramp. */
function cellColor(value: number) {
  if (value >= 80) return "var(--teal)";
  if (value >= 40) return "var(--amber)";
  return "var(--red)";
}

export function HeatmapCalendar({
  cells,
  columns = 7,
  emptyText = "—",
  /** Required accessible name. The component takes it as a PROP rather than reaching
      for next-intl, because @repo/ui has no i18n runtime — the app shim supplies it. */
  ariaLabel,
  error,
  loading,
  loadingText,
}: {
  cells: HeatmapCell[];
  columns?: number;
  emptyText?: React.ReactNode;
  ariaLabel?: string;
} & Omit<ChartState, "isEmpty" | "emptyText">) {
  return (
    <ChartFrame
      isEmpty={cells.length === 0}
      error={error}
      loading={loading}
      loadingText={loadingText}
      emptyText={emptyText}
      height={160}
    >
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        role="img"
        aria-label={ariaLabel}
      >
        {cells.map((cell) => (
          <div
            key={cell.date}
            title={cell.label}
            className="num flex aspect-square items-center justify-center rounded-md text-[11px] font-medium text-indigo-ink"
            style={{ background: cellColor(cell.value) }}
          >
            {cell.label}
          </div>
        ))}
      </div>
    </ChartFrame>
  );
}
