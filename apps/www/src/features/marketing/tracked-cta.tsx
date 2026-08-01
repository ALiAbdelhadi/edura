"use client";

import { LedgerButton } from "@/components/ledger";
import { Link } from "@/i18n/navigation";
import { track } from "@/lib/track";
import { ANALYTICS_EVENTS } from "@repo/observability";
import type { ReactNode } from "react";

/**
 * An internal CTA that records the click. Thin on purpose: the ONLY reason it
 * is a client component is the `onClick`, so every marketing page can stay a
 * server component and still be instrumented.
 */
export function TrackedCta({
  href,
  cta,
  surface,
  variant = "primary",
  className,
  style,
  children,
}: {
  href: string;
  /** Which action was offered — "register", "contact", "pricing"… */
  cta: string;
  /** Where on the page it was offered. */
  surface: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  return (
    <LedgerButton asChild variant={variant} className={className} style={style}>
      <Link href={href} onClick={() => track(ANALYTICS_EVENTS.LANDING_CTA_CLICKED, { cta, surface })}>
        {children}
      </Link>
    </LedgerButton>
  );
}
