import * as React from "react"
import { UserCheck } from "lucide-react"

import { cn } from "@repo/ui/lib/utils"
import { Num } from "@repo/ui/components/num"
import { Eyebrow } from "@repo/ui/components/eyebrow"

/**
 * الدفتر / The Ledger — the delegation strip.
 *
 * Permanent chrome for the assistant portal. It occupies the slot the
 * financial cycle occupies in superadmin, and it states whose behalf this is
 * on — always, on every screen, without scrolling.
 *
 * "An assistant writes on another's behalf" is the entire distinguishing fact
 * of that portal, and **the interface must say it before the audit log does.**
 * An assistant who forgets whose account they are acting in will write to the
 * wrong teacher's roster, and the audit trail will faithfully record that they
 * meant to.
 *
 * Two rules that live outside this component but belong to the same guarantee:
 *
 *   1. **Excluded capabilities are ABSENT, not disabled.** Wallet, payouts,
 *      financial settings and managing other assistants do not render at all
 *      for an assistant. A disabled control teaches that the capability exists
 *      and is being withheld, which invites the user to go looking for a way
 *      around it. Enforce this in the nav and the screen, not with a `disabled`
 *      prop.
 *   2. **Assistants message as THEMSELVES, never impersonating.** This strip
 *      says "acting for X"; it must never be read as "you are X". An adult
 *      must never appear to a minor under another identity — a child-safety
 *      property, not a UX nicety.
 */

export interface DelegationStripProps {
  /** Localized «تعمل نيابةً عن» / "Acting on behalf of". */
  label: React.ReactNode
  /** The principal — the teacher this assistant acts for. */
  principalName: React.ReactNode
  /** Their id/code, mono. Makes the attribution checkable, not just stated. */
  principalRef?: React.ReactNode
  /** Localized eyebrow, e.g. «تفويض» / "DELEGATION". */
  eyebrow?: React.ReactNode
  className?: string
}

function DelegationStrip({
  label,
  principalName,
  principalRef,
  eyebrow,
  className,
}: DelegationStripProps) {
  return (
    <div
      data-slot="delegation-strip"
      className={cn(
        "flex items-center gap-3 border-b border-rule bg-indigo-soft px-6 py-2",
        className,
      )}
    >
      <UserCheck className="size-4 shrink-0 text-indigo" aria-hidden />
      {eyebrow ? <Eyebrow className="text-indigo">{eyebrow}</Eyebrow> : null}
      <span className="flex min-w-0 items-baseline gap-1.5 text-[13px]">
        <span className="text-ink-2">{label}</span>
        <span className="truncate font-semibold text-ink">{principalName}</span>
        {principalRef ? (
          <Num className="text-[11px] text-ink-3">{principalRef}</Num>
        ) : null}
      </span>
    </div>
  )
}

export { DelegationStrip }
