"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { capturePageview, captureEvent, initAnalytics } from "./posthog-client";
import { registerTrackSink } from "@/lib/track";
import { ANALYTICS_EVENTS } from "@repo/observability";

export function AnalyticsProvider({ children }: { children?: React.ReactNode }) {
  useEffect(() => {
    initAnalytics();
    registerTrackSink(captureEvent);
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      {children}
    </>
  );
}

function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    capturePageview(pathname);
  }, [pathname, searchParams]);

  return null;
}

export function trackLandingCta(cta: string, surface?: string): void {
  captureEvent(ANALYTICS_EVENTS.LANDING_CTA_CLICKED, { cta, surface });
}
