"use client";

import { cn } from "@repo/ui/lib/utils";
import { WifiOff } from "lucide-react";
import * as React from "react";

/* <ConnectionBanner> — messaging's reconnecting state.
   ══════════════════════════════════════════════════════════════════════════════

   Users occupy this state for REAL DURATIONS, not a flash. So it is an inline strip,
   not a toast: a toast that stays up for ninety seconds is a bug, and one that
   auto-dismisses leaves the user not knowing.

   `--amber`, because amber means WAITING. NOT red: red means irreversible or blocking,
   and a dropped socket has lost nothing — the messages are still there, the send
   button is what stopped working. A red banner would claim data loss that has not
   occurred, and would spend the product's only "something is wrong" colour on
   something that is merely slow.

   It names BOTH halves: what is unavailable, and what still works. "Reconnecting…"
   alone leaves a user guessing whether to retype what they just wrote. */

export function ConnectionBanner({
  state,
  unavailable,
  stillWorks,
  className,
}: {
  state: "connected" | "reconnecting" | "offline";
  /** What has stopped, e.g. "الرسائل الجديدة لن تصل الآن". */
  unavailable: React.ReactNode;
  /** What is unaffected, e.g. "المحادثات السابقة ما زالت متاحة للقراءة". */
  stillWorks?: React.ReactNode;
  className?: string;
}) {
  if (state === "connected") return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-amber/30 bg-amber-soft px-4 py-2 text-xs",
        className,
      )}
    >
      <WifiOff className="size-3.5 shrink-0 text-amber" aria-hidden="true" />
      <span className="font-semibold text-amber">{unavailable}</span>
      {stillWorks ? <span className="text-ink-2">{stillWorks}</span> : null}
    </div>
  );
}
