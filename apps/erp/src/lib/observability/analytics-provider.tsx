"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { capturePageview, captureEvent, initAnalytics } from "./posthog-client";
import { registerTrackSink } from "@/lib/track";

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
