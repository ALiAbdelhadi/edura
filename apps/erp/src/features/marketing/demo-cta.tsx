"use client";

import { LedgerButton } from "@/components/ledger";
import { track } from "@/lib/track";
import { ANALYTICS_EVENTS } from "@repo/observability";
import { CalendarDays } from "lucide-react";

export function DemoCta({
  url,
  label,
  surface,
  variant = "secondary",
  className,
  withIcon = false,
}: {
  url: string | null;
  label: string;
  surface: "navbar" | "hero" | "mobile_nav" | "contact" | "pricing";
  variant?: "primary" | "secondary";
  className?: string;
  withIcon?: boolean;
}) {
  if (!url) return null;

  return (
    <LedgerButton asChild variant={variant} className={className}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track(ANALYTICS_EVENTS.DEMO_REQUESTED, { surface })}
      >
        {withIcon ? <CalendarDays className="size-4 shrink-0" aria-hidden /> : null}
        {label}
      </a>
    </LedgerButton>
  );
}
