/* Chart chrome: the palette, the axis/grid styling, and the frame that supplies the
   states every chart must have.
   ══════════════════════════════════════════════════════════════════════════════

   Why this file exists at all: before it, `lib/analytics/transforms.ts` carried a
   hard-coded seven-hue palette (`#0fa5e9`, `#8b5cf6`, `#f97315`, `#22c55f`, `#ed4899`,
   `#600000`, …) plus ~16 more literal hexes across the grades, admin-reports and
   parent-progress screens. Charts were the one surface that bypassed the token layer
   entirely, so the palette change went straight past them. If each portal session
   fixed charts locally, the product would end up with five palettes.

   ── Colour is meaning, not decoration ────────────────────────────────────────

   The system has four colours and the chart palette may not invent a fifth. Series
   order is therefore semantic, not aesthetic:

     1  --teal    the money series. In a "commission of gross" chart this is the
                  commission — the figure the platform actually earns.
     2  --indigo  the brand/reference series.
     3  --amber   a waiting/pending series.
     4  --ink-3   a neutral "rest" or "of total" series — deliberately grey, because a
                  denominator is not a category.
     5  --red     failure/refund only.

   A caller that needs a specific meaning passes `color` explicitly with a token
   (`var(--teal)`); a caller that just needs N distinguishable series omits it and gets
   them in this order. There is no sixth slot: a chart that needs one is a chart that
   should be two charts. */

import * as React from "react";

import { cn } from "@repo/ui/lib/utils";

/** Series colours, in semantic order. Tokens, never literals. */
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

/** The neutral "of total" / denominator bar. Grey on purpose — see the header. */
export const TRACK_COLOR = "var(--rule)";

/* Axis labels are DATA, so they follow the same rule as every other figure in the
   product: mono, tabular, `--ink-3`. 10px matches the mono-meta step of the type
   scale. */
export const AXIS_TICK = {
  fontSize: 10,
  fill: "var(--ink-3)",
  fontFamily: "var(--font-mono)",
} as const;

/** 1px `--rule`, dashed `2 4`. Structure, not decoration — it must not compete. */
export const GRID = {
  stroke: "var(--rule)",
  strokeDasharray: "2 4",
  strokeWidth: 1,
} as const;

export type ChartState = {
  /** Nothing to plot. Not an error — a chart with no rows yet is a normal state. */
  isEmpty?: boolean;
  /** The fetch failed. Distinct from empty: one is "nothing happened", the other is
      "we don't know what happened", and conflating them is a lie about the data. */
  error?: React.ReactNode;
  loading?: boolean;
  emptyText?: React.ReactNode;
  loadingText?: React.ReactNode;
  height?: number;
};

/* ── The direction island ──────────────────────────────────────────────────────
   recharts computes axis geometry in physical left-to-right terms and does not
   understand `dir="rtl"`; rendered inside an RTL page it mirrors its own internals and
   the result is unreadable. The fix is an explicit LTR island around the plot ONLY —
   the card, its title, its legend and its figures stay in the page direction.

   Decision (held product-wide): the TIME AXIS FOLLOWS THE CHART, i.e. time runs left
   to right in both locales. A time series is read as a shape, and mirroring it inverts
   the meaning of "rising". Categorical axes are not time and are unaffected. */
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
