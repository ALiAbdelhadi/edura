"use client";

import { cn } from "@repo/ui/lib/utils";
import { WifiOff } from "lucide-react";
import * as React from "react";

export function ConnectionBanner({
  state,
  unavailable,
  stillWorks,
  className,
}: {
  state: "connected" | "reconnecting" | "offline";
  unavailable: React.ReactNode;
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
