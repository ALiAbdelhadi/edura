import * as React from "react";

import { cn } from "@repo/ui/lib/utils";

export const SERIES_COLORS = [
  "var(--teal)",
  "var(--indigo)",
  "var(--amber)",
  "var(--ink-3)",
  "var(--red)",
] as const;

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length]!;
}

export const TRACK_COLOR = "var(--rule)";

export const AXIS_TICK = {
  fontSize: 10,
  fill: "var(--ink-3)",
  fontFamily: "var(--font-mono)",
} as const;

export const GRID = {
  stroke: "var(--rule)",
  strokeDasharray: "2 4",
  strokeWidth: 1,
} as const;

export type ChartState = {
  isEmpty?: boolean;
  error?: React.ReactNode;
  loading?: boolean;
  emptyText?: React.ReactNode;
  loadingText?: React.ReactNode;
  height?: number;
};

export function ChartFrame({
  isEmpty,
  error,
  loading,
  emptyText = "—",
  loadingText,
  height = 260,
  className,
  children,
}: ChartState & { className?: string; children?: React.ReactNode }) {
  if (loading) {
    return (
      <div
        className={cn("flex items-center justify-center text-sm text-ink-3", className)}
        style={{ height }}
        role="status"
        aria-live="polite"
      >
        {loadingText ?? emptyText}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-lg border border-red/40 bg-red-soft/40 px-4 text-center",
          className,
        )}
        style={{ height }}
        role="alert"
      >
        <span className="text-sm font-semibold text-red">{error}</span>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border border-dashed border-rule px-4 text-center text-sm text-ink-3",
          className,
        )}
        style={{ height }}
      >
        {emptyText}
      </div>
    );
  }

  return (
    <div dir="ltr" className={cn("w-full", className)}>
      {children}
    </div>
  );
}
