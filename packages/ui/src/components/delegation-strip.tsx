import { cn } from "@repo/ui/lib/utils";
import { UserCog } from "lucide-react";
import * as React from "react";

export function DelegationStrip({
  label,
  principal,
  actor,
  className,
}: {
  label: React.ReactNode;
  principal: React.ReactNode;
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
