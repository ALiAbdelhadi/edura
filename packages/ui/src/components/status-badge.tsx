import { cn } from "@repo/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

/* <StatusBadge>
   ══════════════════════════════════════════════════════════════════════════════

   Colour discipline, enforced by the type: the system has four colours and each means
   exactly one thing.

     pending   amber   WAITING, and nothing else
     paid      teal    money out / confirmed / verified
     rejected  red     irreversible, failed, or blocking
     active    indigo  brand / in-progress
     neutral   ink-2   draft, or a state with no urgency

   Two rules the old badge did not carry, both from the audit:

   · A PENDING BADGE CARRIES ITS OWN AGE. Waiting is the operator's real metric — "12
     pending" is a number, "oldest is 3 days" is a decision. A pending badge with no
     age hides the only part that matters.
   · A REJECTED BADGE CARRIES ITS REASON. A rejection with no reason is a bug: someone
     has to explain it to a parent at a counter, and "rejected" alone cannot be
     explained.

   The `tone` names are the LEGACY vocabulary (success/warning/info/danger/primary/
   neutral) plus the ledger vocabulary. Both are accepted so the 42 existing call sites
   keep working; new code uses the ledger names. */

export type StatusTone =
  // ledger vocabulary — prefer these
  | "pending"
  | "paid"
  | "rejected"
  | "active"
  | "neutral"
  // legacy aliases, kept so existing call sites compile unchanged
  | "success"
  | "warning"
  | "info"
  | "danger"
  | "primary";

const TONE: Record<StatusTone, string> = {
  pending: "bg-amber-soft text-amber",
  paid: "bg-teal-soft text-teal",
  rejected: "bg-red-soft text-red",
  active: "bg-indigo-soft text-indigo",
  neutral: "bg-rule-2 text-ink-2",
  // aliases
  success: "bg-teal-soft text-teal",
  warning: "bg-amber-soft text-amber",
  info: "bg-indigo-soft text-indigo",
  danger: "bg-red-soft text-red",
  primary: "bg-indigo-soft text-indigo",
};

export function StatusBadge({
  tone = "neutral",
  icon: Icon,
  /** Pending only: how long it has been waiting. Renders after a `·` separator. */
  age,
  /** Rejected only: rendered on its own line beneath, in --red. */
  reason,
  className,
  children,
}: {
  tone?: StatusTone;
  icon?: LucideIcon;
  age?: React.ReactNode;
  reason?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const badge = (
    <span
      data-slot="status-badge"
      data-tone={tone}
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-[5px] px-2 py-0.5 text-xs font-semibold",
        TONE[tone],
        className,
      )}
    >
      {Icon ? <Icon className="size-3" aria-hidden="true" /> : null}
      {children}
      {age ? (
        <>
          {/* The separator is rendered by the component, never typed into the copy —
              `·` is bidi-neutral and lands on the wrong side of a Latin age like
              "3d" inside an RTL row if it is part of the string. */}
          <span aria-hidden="true" className="opacity-50">
            ·
          </span>
          <span className="num font-medium">{age}</span>
        </>
      ) : null}
    </span>
  );

  if (!reason) return badge;
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      {badge}
      <span className="text-[11px] text-red">{reason}</span>
    </span>
  );
}
