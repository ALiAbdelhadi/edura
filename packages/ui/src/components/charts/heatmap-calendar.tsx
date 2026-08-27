"use client";

import * as React from "react";

import { ChartFrame, type ChartState } from "./chart-frame";

export type HeatmapTone = "positive" | "warning" | "negative" | "none" | "blank";

export type HeatmapCell = {
  date: string;
  label: string;
  tone: HeatmapTone;
  title?: string;
};

const TONE_STYLE: Record<HeatmapTone, React.CSSProperties> = {
  positive: {
    background: "var(--teal-soft)",
    boxShadow: "inset 0 0 0 1px var(--teal)",
    color: "var(--ink)",
  },
  warning: {
    background: "var(--amber-soft)",
    boxShadow: "inset 0 0 0 1px var(--amber)",
    color: "var(--ink)",
  },
  negative: {
    background: "var(--red-soft)",
    boxShadow: "inset 0 0 0 1px var(--red)",
    color: "var(--ink)",
  },
  none: {
    background: "transparent",
    boxShadow: "inset 0 0 0 1px var(--rule-2)",
    color: "var(--ink-3)",
  },
  blank: { background: "transparent" },
};

export function HeatmapCalendar({
  cells,
  columns = 7,
  emptyText = "—",
  ariaLabel,
  weekdayLabels,
  pageDir = "ltr",
  error,
  loading,
  loadingText,
}: {
  cells: HeatmapCell[];
  columns?: number;
  emptyText?: React.ReactNode;
  ariaLabel?: string;
  weekdayLabels?: string[];
  pageDir?: "ltr" | "rtl";
} & Omit<ChartState, "isEmpty" | "emptyText">) {
  const template = `repeat(${columns}, minmax(0, 1fr))`;
  const anchor: React.CSSProperties =
    pageDir === "rtl" ? { marginInlineStart: "auto" } : { marginInlineEnd: "auto" };

  return (
    <ChartFrame
      isEmpty={cells.length === 0}
      error={error}
      loading={loading}
      loadingText={loadingText}
      emptyText={emptyText}
      height={200}
    >
      <div className="w-full max-w-[336px]" style={anchor}>
        {weekdayLabels && weekdayLabels.length === columns ? (
          <div
            aria-hidden
            className="mb-1.5 grid gap-1.5"
            style={{ gridTemplateColumns: template }}
          >
            {weekdayLabels.map((day, i) => (
              <div
                key={i}
                className="text-center text-[10px] font-semibold text-ink-3"
              >
                {day}
              </div>
            ))}
          </div>
        ) : null}

        <ul
          className="grid list-none gap-1.5 p-0"
          style={{ gridTemplateColumns: template }}
          aria-label={ariaLabel}
        >
          {cells.map((cell) =>
            cell.tone === "blank" ? (
              <li key={cell.date} aria-hidden className="aspect-square" />
            ) : (
              <li
                key={cell.date}
                title={cell.title ?? cell.label}
                aria-label={cell.title ?? cell.label}
                className="num flex aspect-square items-center justify-center rounded-md text-[11px] font-medium"
                style={TONE_STYLE[cell.tone]}
              >
                {cell.label}
              </li>
            ),
          )}
        </ul>
      </div>
    </ChartFrame>
  );
}
