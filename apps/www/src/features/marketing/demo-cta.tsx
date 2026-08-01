"use client";

import { LedgerButton } from "@/components/ledger";
import { track } from "@/lib/track";
import { CalendarDays } from "lucide-react";

/**
 * «احجز عرضًا» — the demo-booking CTA.
 *
 * Renders NOTHING when `url` is null (NEXT_PUBLIC_CALENDLY_URL unset). A demo
 * button that opens nothing is worse than no button: it burns the one click a
 * visitor was willing to give. The env check happens on the server in
 * `demoBookingUrl()`; this component only decides how to present it.
 *
 * `rel="noopener noreferrer"` because the scheduling tool is a third-party
 * origin opened with `target="_blank"`.
 */
export function DemoCta({
  url,
  label,
  placement,
  variant = "secondary",
  className,
  withIcon = false,
}: {
  url: string | null;
  label: string;
  /** Recorded on the event so navbar vs hero conversion can be compared. */
  placement: "navbar" | "hero" | "mobile_nav" | "contact" | "pricing";
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
        onClick={() => track("demo_requested", { placement })}
      >
        {withIcon ? <CalendarDays className="size-4 shrink-0" aria-hidden /> : null}
        {label}
      </a>
    </LedgerButton>
  );
}
