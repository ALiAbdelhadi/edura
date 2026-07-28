"use client";

import { cn } from "@repo/ui/lib/utils";
import { Check, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import * as React from "react";

/* <CommitState> — per RECORD, for the offline attendance outbox.
   ══════════════════════════════════════════════════════════════════════════════

   The outbox syncs later and conflicts resolve server-wins. The truth for any single
   check-in is therefore: THIS MAY NOT HAVE REACHED THE SERVER YET.

   Why per-record and not a global banner: a receptionist who cannot tell whether THIS
   student's check-in committed will check them in again. The interface's honesty here
   directly prevents a data problem, which is why the indicator sits on the row and not
   in the chrome.

   `queued` is deliberately NOT an error state. Nothing has failed; the record is held
   and will be sent. Colouring it red would teach staff to distrust a working system —
   amber, because amber means waiting. */

export type CommitStatus = "committed" | "queued" | "syncing" | "failed";

export function CommitState({
  status,
  labels,
  /** When it was queued — a 40-minute-old queued record means something IS wrong. */
  since,
  className,
}: {
  status: CommitStatus;
  labels: Record<CommitStatus, string>;
  since?: React.ReactNode;
  className?: string;
}) {
  const Icon =
    status === "committed"
      ? Check
      : status === "syncing"
        ? RefreshCw
        : status === "failed"
          ? TriangleAlert
          : CloudOff;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[11px] font-semibold",
        status === "committed" && "bg-teal-soft text-teal",
        status === "queued" && "bg-amber-soft text-amber",
        status === "syncing" && "bg-indigo-soft text-indigo",
        status === "failed" && "bg-red-soft text-red",
        className,
      )}
      // The status is announced, not conveyed by colour and glyph alone.
      role="status"
    >
      <Icon
        className={cn("size-3", status === "syncing" && "motion-safe:animate-spin")}
        aria-hidden="true"
      />
      {labels[status]}
      {since && status !== "committed" ? (
        <span className="num font-medium opacity-80">{since}</span>
      ) : null}
    </span>
  );
}
