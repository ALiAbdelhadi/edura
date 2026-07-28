"use client"

import * as React from "react"
import { Check, CloudOff, RefreshCw, TriangleAlert } from "lucide-react"

import { cn } from "@repo/ui/lib/utils"
import { Num } from "@repo/ui/components/num"

/**
 * الدفتر / The Ledger — per-record commit state.
 *
 * For the offline attendance outbox, and anything else that writes later.
 *
 * THIS IS PER RECORD, NEVER A GLOBAL BANNER, and that is the whole point. A
 * teacher marking a hall of students needs to know whether *this student's*
 * check-in reached the server. A banner saying "3 items pending" does not
 * answer that, so the teacher re-checks the student in — and now attendance is
 * double-counted, which is a money problem, because attendance drives session
 * settlement.
 *
 * Interface honesty here directly prevents a data problem. That is the
 * clearest case in the product for why these rules are not decoration.
 *
 * Four states, and `queued` is deliberately NOT an error colour:
 *   committed — the server has it. Teal.
 *   syncing   — in flight right now. Indigo.
 *   queued    — held locally, will send. AMBER: waiting, not broken. Nothing
 *               has been lost, and colouring it red teaches the operator to
 *               panic at the normal offline case.
 *   failed    — the server rejected it. Red, and it must say why.
 */

export type CommitState = "committed" | "syncing" | "queued" | "failed"

const STATE = {
  committed: { cls: "bg-teal-soft text-teal", Icon: Check },
  syncing: { cls: "bg-indigo-soft text-indigo", Icon: RefreshCw },
  queued: { cls: "bg-amber-soft text-amber", Icon: CloudOff },
  failed: { cls: "bg-red-soft text-red", Icon: TriangleAlert },
} as const

export interface CommitStateIndicatorProps {
  state: CommitState
  /** Localized state name. Required — the colour alone is not an equivalent. */
  label: React.ReactNode
  /** How long it has been queued. Mono. */
  age?: React.ReactNode
  /** Why it failed. Required in practice when state is "failed". */
  reason?: React.ReactNode
  className?: string
}

function CommitStateIndicator({
  state,
  label,
  age,
  reason,
  className,
}: CommitStateIndicatorProps) {
  const { cls, Icon } = STATE[state]
  return (
    <span className={cn("inline-flex flex-col items-start gap-1", className)}>
      <span
        data-slot="commit-state"
        data-state={state}
        // Announce transitions: a record moving queued -> committed while the
        // operator is looking elsewhere is exactly what they need to hear.
        role="status"
        aria-live="polite"
        className={cn(
          "inline-flex w-fit items-center gap-1 rounded-[5px] px-2 py-[2px]",
          "text-xs font-semibold whitespace-nowrap",
          cls,
        )}
      >
        <Icon
          className={cn(
            "size-3 shrink-0",
            // The spinner is the one motion exception outside the seal: it
            // encodes "still happening", which a static icon cannot.
            state === "syncing" && "animate-spin motion-reduce:animate-none",
          )}
        />
        {label}
        {age ? (
          <>
            <span aria-hidden className="opacity-50">
              ·
            </span>
            <Num className="text-[11px] font-medium">{age}</Num>
          </>
        ) : null}
      </span>
      {reason ? (
        <span className="text-[11px] leading-tight text-red">{reason}</span>
      ) : null}
    </span>
  )
}

export { CommitStateIndicator }
