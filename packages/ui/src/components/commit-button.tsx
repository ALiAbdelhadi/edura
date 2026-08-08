"use client"

import * as React from "react"
import { Lock } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@repo/ui/lib/utils"

/**
 * الدفتر / The Ledger — the two-step commit.
 *
 * THE SIGNATURE INTERACTION. It must be identical in every portal: a teacher
 * requesting a payout, a center recording cash, a student paying from wallet,
 * a superadmin approving disbursement. Same guarantee, same form. Do not build
 * a lighter version because your portal "feels less serious" — the write is
 * equally irreversible from every side of the transaction.
 *
 * Unarmed: full-width 46px indigo, the action icon, and a label that CARRIES
 * ITS OWN AMOUNT — «اعتماد وصرف 38,235.00 ج.م». The operator is authorising a
 * specific number, not a row they happen to have selected.
 *
 * Armed (after the first press): the button turns --red, the icon becomes a
 * lock, and the label states finality. The second press commits.
 *
 * Arming resets on:
 *   - row change      (`resetKey` changes)
 *   - route change    (unmount)
 *   - Escape
 *   - after commit
 *
 * The armed transition is ANNOUNCED: `role="status"` + `aria-live="polite"` on
 * the hint, and `aria-pressed` on the button. A sighted user sees the colour
 * change; without this a screen-reader user would press twice having been told
 * nothing changed, which is the exact failure the two-step exists to prevent.
 *
 * `anchored` pins the button to the bottom of the viewport for the center
 * counter — same ceremony, thumb-reachable ergonomics. A prop, never a fork.
 */

export interface CommitButtonProps {
  /** The label INCLUDING the amount. «اعتماد وصرف 38,235.00 ج.م» */
  label: React.ReactNode
  /** Shown once armed. Should state finality, not repeat the action. */
  armedLabel: React.ReactNode
  /** Hint under the button, unarmed. Explain that two presses are required. */
  hint?: React.ReactNode
  /** Hint under the button, armed. Explain what the second press writes. */
  armedHint?: React.ReactNode
  icon?: LucideIcon
  /**
   * Changing this disarms. Pass the selected row's id: moving to another row
   * must never leave a primed commit pointed at a different amount.
   */
  resetKey?: string | number | null
  disabled?: boolean
  pending?: boolean
  onCommit: () => void
  /** Pin to the bottom of the viewport (center counter / touch density). */
  anchored?: boolean
  className?: string
}

function CommitButton({
  label,
  armedLabel,
  hint,
  armedHint,
  icon: Icon,
  resetKey = null,
  disabled = false,
  pending = false,
  onCommit,
  anchored = false,
  className,
}: CommitButtonProps) {
  const [armed, setArmed] = React.useState(false)

  // Disarm whenever the subject changes. Without this the operator can arm on
  // row A, click row B, and commit B's write having read A's amount.
  React.useEffect(() => {
    setArmed(false)
  }, [resetKey])

  // Escape disarms — the universal "I did not mean that".
  React.useEffect(() => {
    if (!armed) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setArmed(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [armed])

  function handleClick() {
    if (disabled || pending) return
    if (!armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    onCommit()
  }

  const ActiveIcon = armed ? Lock : Icon

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        anchored &&
          "sticky bottom-0 z-20 -mx-[18px] border-t border-rule bg-sheet px-[18px] pt-3 pb-[max(12px,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || pending}
        aria-pressed={armed}
        data-armed={armed || undefined}
        className={cn(
          // 46px, not the direction's 42px inline money button: this is the
          // touch-density money control (the counter, one-handed, with a queue),
          // and 42 falls under the 48px-minimum-target rule it already sits
          // close to. The RADIUS follows the new scale; the height does not.
          "inline-flex h-[46px] w-full items-center justify-center gap-2 rounded-(--radius-step-md)",
          "text-sm font-semibold transition-colors duration-100",
          "disabled:cursor-not-allowed disabled:opacity-50",
          armed
            ? "bg-red text-white hover:bg-red/90"
            : "bg-indigo text-indigo-ink hover:bg-indigo/90",
        )}
      >
        {ActiveIcon ? <ActiveIcon className="size-4 shrink-0" /> : null}
        {armed ? armedLabel : label}
      </button>

      {hint || armedHint ? (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "text-center text-[11px] leading-tight",
            armed ? "text-red" : "text-ink-3",
          )}
        >
          {armed ? armedHint : hint}
        </p>
      ) : null}
    </div>
  )
}

export { CommitButton }
