import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@repo/ui/lib/utils"
import { Num } from "@repo/ui/components/num"

/**
 * الدفتر / The Ledger — metric card.
 *
 * Three rows, and row 3 is the point:
 *
 *   1. Coloured 13/600 label + 15px icon, optional mono meta at the far end
 *      (`SLA 48h`). The colour is the semantic STATE, never decoration.
 *   2. The figure: mono 34/600, optionally baseline-aligned with a mono 14/600
 *      money figure in --teal.
 *   3. **The reason this number matters** — one fact, 12px --ink-2, with a
 *      13px icon. «أقدم طلب: ٣ أيام — أ. شريف الجندي». NEVER a percentage
 *      delta with no referent: "+12%" against nothing tells an operator
 *      nothing they can act on, and the old trend-arrow trio said exactly that.
 *
 * Cards are links. Each one is the door to its queue — a metric an operator
 * cannot click is a metric they have to go find.
 *
 * `blocking` carries a --red border and a chip («يوقف الصرف»): this number is
 * not merely bad, it is stopping something downstream.
 *
 * REMOVED from the old StatCard: the gradient `filled` variant, the `accent`
 * glow, and the trend/trendValue arrow trio. All three had ZERO call sites
 * across both apps (measured, not assumed), so nothing churns. Hierarchy now
 * comes from order and the blocking variant, not from shine.
 */

export interface MetricCardProps {
  label: React.ReactNode
  value: React.ReactNode
  /** Small suffix on the figure — «ج.م», «طالب». */
  unit?: React.ReactNode
  /** Secondary money figure, baseline-aligned with the count, in --teal. */
  money?: React.ReactNode
  /** Mono meta at the far end of row 1 — `SLA 48h`. */
  meta?: React.ReactNode
  /** Row 3: the one fact that explains why this number matters. */
  fact?: React.ReactNode
  factIcon?: LucideIcon
  icon?: LucideIcon
  /** Semantic state. Drives the label + icon colour. */
  tone?: "neutral" | "pending" | "money" | "blocking"
  /** Renders the red border + chip. Pass the chip text, or `true` for default. */
  blocking?: boolean
  blockingLabel?: React.ReactNode
  /** The queue this card is the door to. */
  href?: string
  className?: string

  /**
   * @deprecated Use `fact`. Kept because 7 call sites still pass it; it renders
   * in the row-3 slot so those screens are already correct.
   */
  hint?: React.ReactNode

  /**
   * @deprecated ACCEPTED AND IGNORED. The gradient "filled" card and the
   * `accent` glow are gone from the system — hierarchy now comes from card
   * ORDER and the `blocking` variant, not from shine. These props remain in
   * the signature only so the 8 `filled` call sites across both apps keep
   * compiling; a promotion that forces a call site to change is a promotion
   * done wrong (design/DECISIONS.md D-01, D-08). Portal sessions drop them as
   * they convert their screens, then these come out.
   */
  filled?: boolean
  /** @deprecated Accepted and ignored. See `filled`. */
  accent?: boolean
  /** @deprecated Accepted and ignored — a delta with no referent says nothing. */
  trend?: "up" | "down" | "flat"
  /** @deprecated Accepted and ignored. See `trend`. */
  trendValue?: React.ReactNode
}

const TONE_TEXT = {
  neutral: "text-ink-2",
  pending: "text-amber",
  money: "text-teal",
  blocking: "text-red",
} as const

function MetricCard({
  label,
  value,
  unit,
  money,
  meta,
  fact,
  factIcon: FactIcon,
  icon: Icon,
  tone = "neutral",
  blocking = false,
  blockingLabel,
  href,
  className,
  hint,
  // Destructured so they never reach the DOM as unknown attributes.
  filled: _filled,
  accent: _accent,
  trend: _trend,
  trendValue: _trendValue,
}: MetricCardProps) {
  const row3 = fact ?? hint
  const Root = (href ? "a" : "div") as React.ElementType

  return (
    <Root
      {...(href ? { href } : {})}
      data-slot="metric-card"
      className={cn(
        "flex flex-col gap-3.5 rounded-lg border bg-sheet p-[18px] shadow-lift",
        "transition-colors",
        blocking ? "border-red" : "border-rule",
        href && "hover:bg-field",
        className,
      )}
    >
      {/* Row 1 — label, icon, meta */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "flex min-w-0 items-center gap-1.5 text-[13px] font-semibold",
            TONE_TEXT[blocking ? "blocking" : tone],
          )}
        >
          {Icon ? <Icon className="size-[15px] shrink-0" /> : null}
          <span className="truncate">{label}</span>
        </span>
        {meta ? (
          <Num className="shrink-0 text-[11px] text-ink-3">{meta}</Num>
        ) : null}
      </div>

      {/* Row 2 — the figure */}
      <div className="flex items-baseline gap-2.5">
        <Num
          className={cn(
            "text-[34px] leading-none font-semibold",
            blocking ? "text-red" : "text-ink",
          )}
        >
          {value}
        </Num>
        {unit ? (
          <span className="text-sm font-normal text-ink-2">{unit}</span>
        ) : null}
        {money ? (
          <Num className="text-sm font-semibold text-teal">{money}</Num>
        ) : null}
        {blocking ? (
          <span className="ms-auto rounded-[5px] bg-red-soft px-1.5 py-0.5 text-[11px] font-semibold text-red">
            {blockingLabel ?? "يوقف الصرف"}
          </span>
        ) : null}
      </div>

      {/* Row 3 — why this number matters */}
      {row3 ? (
        <div className="flex items-center gap-1.5 text-xs text-ink-2">
          {FactIcon ? <FactIcon className="size-[13px] shrink-0" /> : null}
          <span className="truncate">{row3}</span>
        </div>
      ) : null}
    </Root>
  )
}

export { MetricCard }
/** @deprecated Import `MetricCard`. Alias kept so 26 call sites do not churn. */
export { MetricCard as StatCard }
