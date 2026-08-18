"use client";

import * as React from "react";

import { ChartFrame, type ChartState } from "./chart-frame";

/* ── What this draws, and why it is not a heatmap ──────────────────────────────

   Attendance encodes a STATUS — present, late, absent — not a continuous
   magnitude, so there is no ramp to interpolate along and the three semantic
   tokens do the work directly.

   THE FOURTH TONE IS THE POINT. The previous version's cell type was
   `{ date, value }` with thresholds (>=80 teal, >=40 amber, else red), which
   made "nothing happened on this day" INEXPRESSIBLE: every value landed on one
   of three saturated colours, so a day with no lesson could only be drawn as an
   absence. The screen therefore rendered ONLY the days that carried a record —
   four days became four tiles, and a "last 28 days" calendar with four squares
   in it is not a calendar, it is four squares. `none` is what a month mostly
   consists of, and it now has a name.

   THE FILL IS THE SOFT TOKEN, NOT THE HUE. A grid of saturated blocks reads as
   an error state and forces a text colour that has to be re-verified against
   three fills in two themes. Soft fill + a hairline ring in the full hue keeps
   the status legible, keeps the day number on `--ink` (a pair the constitution
   already verifies at §6.6), and matches what §4 permits on a student surface:
   fills and tiles, no new hue.

   COLOUR IS NEVER THE ONLY CHANNEL. Every cell carries its status in its
   accessible name, so the grid is walkable without seeing any of it. */

/** `blank` is not a day. It is the front padding that makes column 1 always
    Sunday — drawn as nothing, hidden from assistive tech, absent from the
    legend, so a card promising "the last 28 days" contains exactly 28 days. */
export type HeatmapTone = "positive" | "warning" | "negative" | "none" | "blank";

export type HeatmapCell = {
  /** ISO `YYYY-MM-DD`. Identity, and the sort key. */
  date: string;
  /** What is printed IN the cell — the day of the month, localized by the caller. */
  label: string;
  tone: HeatmapTone;
  /** The full accessible sentence: "Sunday 3 August — present". */
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
  /* No lesson. Present in the grid — a gap in a calendar is information — but
     drawn as the quietest thing on the card so the three real statuses carry
     every bit of the contrast. */
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
  /** Required accessible name. The component takes it as a PROP rather than reaching
      for next-intl, because @repo/ui has no i18n runtime — the app shim supplies it. */
  ariaLabel,
  /** Column headings, already localized and already in LTR order (Sun…Sat). Omitted
      ⇒ no header row, because an unlabelled row of letters is worse than none. */
  weekdayLabels,
  /** The PAGE's direction, which is not this grid's. Days run left-to-right in
      both locales (a time axis follows the chart, §6.4), so the grid lives in
      ChartFrame's LTR island — but the capped BLOCK must still sit on the page's
      start edge, or an RTL card ends up with the calendar pinned left and its
      own legend pinned right. Inside the island every logical property already
      resolves against LTR, so the page's direction has to arrive as data. */
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
      {/* Capped rather than fluid. Stretched across a desktop card each cell
          became a ~110px slab; a day in a month is a small object and reads as
          one. Below the cap it still shrinks with the card. */}
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
