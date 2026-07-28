import * as React from "react"
import { WifiOff } from "lucide-react"

import { cn } from "@repo/ui/lib/utils"

/**
 * الدفتر / The Ledger — connection banner.
 *
 * Messaging has a persistent reconnecting state that users occupy for real
 * durations, not a blip. So this is an inline --amber strip, NOT a red toast:
 *
 *   - **Amber, because nothing has been lost.** Red says "something broke and
 *     you need to act". A dropped socket on a train is neither. Red here
 *     teaches users to ignore red.
 *   - **Inline, because it persists.** A toast that stays for four minutes is
 *     a broken toast; one that auto-dismisses while still true is a lie.
 *   - **It names what is unavailable AND what still works.** "Reconnecting"
 *     alone leaves the user unable to decide whether to keep typing. The
 *     honest version is "new messages are delayed — what you send will be
 *     delivered when the connection returns."
 */

export interface ConnectionBannerProps {
  /** What is currently unavailable. */
  unavailable: React.ReactNode
  /** What still works despite it. Omitting this is what makes users give up. */
  stillWorks?: React.ReactNode
  className?: string
}

function ConnectionBanner({
  unavailable,
  stillWorks,
  className,
}: ConnectionBannerProps) {
  return (
    <div
      data-slot="connection-banner"
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-2 border-y border-amber/30 bg-amber-soft px-4 py-2",
        "text-xs leading-snug text-amber",
        className,
      )}
    >
      <WifiOff className="mt-px size-3.5 shrink-0" aria-hidden />
      <p className="min-w-0">
        <span className="font-semibold">{unavailable}</span>
        {stillWorks ? (
          <>
            {" — "}
            <span className="font-normal">{stillWorks}</span>
          </>
        ) : null}
      </p>
    </div>
  )
}

export { ConnectionBanner }
