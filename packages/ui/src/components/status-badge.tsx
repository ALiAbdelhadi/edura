import * as React from "react"

import { cn } from "@repo/ui/lib/utils"
import { Num } from "@repo/ui/components/num"

/**
 * الدفتر / The Ledger — status badge.
 *
 * Soft fill, strong text, 12/600, radius 5. Never a saturated pill.
 *
 * Two rules that are part of the component rather than left to the caller,
 * because leaving them to the caller is how they get forgotten:
 *
 *   `age`    — a PENDING badge carries its own age («بانتظار الصرف · ٣ أيام»).
 *              "Pending" alone withholds the one fact the operator needs;
 *              waiting time is the operator's real metric.
 *   `reason` — a REJECTED badge is followed by its reason. A rejection with no
 *              reason displayed is a bug, not a terse state.
 */

export type StatusTone =
  | "pending"
  | "paid"
  | "rejected"
  | "neutral"
  // Legacy tone names — kept so the 44 existing call sites do not churn.
  // Map onto the four Ledger tones above. See design/DECISIONS.md D-01.
  | "success"
  | "warning"
  | "info"
  | "danger"
  | "primary"

const TONE: Record<StatusTone, string> = {
  pending: "bg-amber-soft text-amber",
  paid: "bg-teal-soft text-teal",
  rejected: "bg-red-soft text-red",
  neutral: "bg-rule-2 text-ink-2",

  // legacy aliases
  success: "bg-teal-soft text-teal",
  warning: "bg-amber-soft text-amber",
  info: "bg-indigo-soft text-indigo",
  danger: "bg-red-soft text-red",
  primary: "bg-indigo-soft text-indigo",
}

export interface StatusBadgeProps {
  tone?: StatusTone
  /** How long this has been waiting. Renders as a mono suffix after a `·`. */
  age?: React.ReactNode
  /** Why this was rejected. Renders as an 11px --red line beneath the badge. */
  reason?: React.ReactNode
  /** 12px leading icon. */
  icon?: React.ComponentType<{ className?: string }>
  className?: string
  children: React.ReactNode
}

function StatusBadge({
  tone = "neutral",
  age,
  reason,
  icon: Icon,
  className,
  children,
}: StatusBadgeProps) {
  const badge = (
    <span
      data-slot="status-badge"
      data-tone={tone}
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-[5px] px-2 py-[2px]",
        "text-xs leading-[1.4] font-semibold whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {Icon ? <Icon className="size-3 shrink-0" /> : null}
      {children}
      {age ? (
        <>
          <span aria-hidden className="opacity-50">
            ·
          </span>
          <Num className="text-[11px] font-medium">{age}</Num>
        </>
      ) : null}
    </span>
  )

  if (!reason) return badge

  return (
    <span className="inline-flex flex-col items-start gap-1">
      {badge}
      <span className="text-[11px] leading-tight text-red">{reason}</span>
    </span>
  )
}

export { StatusBadge }
