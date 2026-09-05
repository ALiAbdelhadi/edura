import { cn } from "@repo/ui/lib/utils";
import * as React from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  rule = false,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  rule?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        rule && "border-b border-rule pb-[18px]",
        className,
      )}
    >
      <div className="space-y-1.5">
        {eyebrow}
        {/* h2, not h1: every page inside AppShell already has the chrome's
            screen label as its h1, and most pages render nothing else. */}
        <h2 className="text-[26px] font-bold tracking-[-0.02em] text-ink">{title}</h2>
        {description ? (
          <p className="max-w-[68ch] text-sm text-ink-2">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
