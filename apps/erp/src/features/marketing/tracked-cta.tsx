"use client";

import { LedgerButton } from "@/components/ledger";
import { Link } from "@/i18n/navigation";
import { track } from "@/lib/track";
import { ANALYTICS_EVENTS } from "@repo/observability";
import type { ReactNode } from "react";

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
  cta: string;
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
