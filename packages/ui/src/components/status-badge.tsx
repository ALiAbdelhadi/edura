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
   keep working; new code uses the ledger names.

   ── Why the badge is not simply mono ──────────────────────────────────────────

   The direction specifies badges as `IBM Plex Mono 11px/600`, and every badge in
   the design document is Latin — `PAID`, `QUEUED · 2m`, `REVOKED`. This product's
   badges are usually Arabic, and Plex Mono ships NO ARABIC GLYPHS: applying it
   would silently drop the text into some other family with no visible error. That
   is the same trap `<Eyebrow>` exists to document, so this component takes the
   same resolution, defaulted the safe way round.

     default          the body face. Correct in both scripts.
     script="latin"   mono + 0.04em tracking, for genuinely Latin badges —
                      `PAID`, `DRAFT`, `TRX-`.

   The GEOMETRY (12px radius, 11px, 600, 4×9 padding) is shared by both, so the
   badge is the same object in either script — only the family differs. The AGE is
   always mono regardless: it is a figure, and figures are mono everywhere. */

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
  neutral: "bg-field text-ink-2",
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
  /**
   * `latin` switches the label to mono + tracking. Only for genuinely Latin
   * content — see the header comment. Arabic must stay on the body face.
   */
  script,
  className,
  children,
}: {
  tone?: StatusTone;
  icon?: LucideIcon;
  age?: React.ReactNode;
  reason?: React.ReactNode;
  script?: "latin";
  className?: string;
  children: React.ReactNode;
}) {
  const badge = (
    <span
      data-slot="status-badge"
      data-tone={tone}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-(--radius-badge) px-[9px] py-[4px] text-[11px] font-semibold",
        script === "latin" && "num tracking-[0.04em]",
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
