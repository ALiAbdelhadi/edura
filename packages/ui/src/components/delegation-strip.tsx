import { cn } from "@repo/ui/lib/utils";
import { UserCog } from "lucide-react";
import * as React from "react";

/* <DelegationStrip> — permanent chrome for the assistant portal.
   ══════════════════════════════════════════════════════════════════════════════

   Every assistant action is already audited as "assistant X on behalf of teacher Y".
   The interface should say so BEFORE the audit log does — an actor who has to check a
   log to learn whose books they are writing in has been told too late.

   It occupies the same slot as the financial cycle in superadmin, and for the same
   reason: it is the SCOPE every figure and every write on the screen belongs to, so it
   is chrome, not a banner that can be dismissed.

   Note what this is NOT: it is not impersonation. An assistant messages AS THEMSELVES
   (see chat-scope) — an adult must never appear to a minor under another identity.
   This strip states delegated AUTHORITY, not a changed identity, and the wording
   should keep that distinction. */

export function DelegationStrip({
  label,
  principal,
  actor,
  className,
}: {
  /** e.g. "تعمل بالنيابة عن" */
  label: React.ReactNode;
  /** The teacher whose authority is being exercised. */
  principal: React.ReactNode;
  /** Optional: the assistant themselves, when the screen is shared with other roles. */
  actor?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-rule bg-field px-6 py-1.5 text-xs",
        className,
      )}
    >
      <UserCog className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
      <span className="text-ink-3">{label}</span>
      <span className="font-semibold text-ink">{principal}</span>
      {actor ? <span className="text-ink-3">· {actor}</span> : null}
    </div>
  );
}
