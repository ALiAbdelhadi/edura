"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import type { SessionLike } from "@repo/observability";
import { capturePageview, captureEvent, identifyUser, initAnalytics } from "./posthog-client";
import { ANALYTICS_EVENTS } from "@repo/observability";

/**
 * Mount once, high in the tree. Does nothing at all when
 * NEXT_PUBLIC_POSTHOG_KEY is unset — which is every local and CI run.
 *
 * `session` comes from the server layout, so identification happens on the
 * first render rather than after a client round-trip. Passing `null` is
 * meaningful: it resets any previous person on a shared device.
 */
export function AnalyticsProvider({
  session,
  children,
}: {
  session: SessionLike | null;
  children?: React.ReactNode;
}) {
  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    identifyUser(session);
    // Re-identify when the ACTOR changes, not on every render of a new object.
  }, [session?.id, session?.role, session?.centerId]);

  return (
    <>
      {/* useSearchParams forces a Suspense boundary in the App Router. */}
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      {children}
    </>
  );
}

/**
 * Manual pageviews. `capture_pageview: false` in the SDK config, because the
 * automatic one fires before our `sanitize_properties` sees the first URL, and
 * because App Router client navigations do not produce one at all.
 *
 * `useSearchParams` is subscribed to only so the effect re-runs on a
 * query-only navigation — its value is deliberately unused, and the query
 * string never reaches PostHog (see `capturePageview`).
 */
function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    capturePageview(pathname);
  }, [pathname, searchParams]);

  return null;
}

/**
 * Funnel step 1. Attach to marketing calls to action.
 *
 * `cta` and `surface` are short slugs from the allowlist ("hero", "pricing"),
 * never the button's visible label — a label is translated copy that changes,
 * which would fragment the funnel on the next copy edit.
 */
export function trackLandingCta(cta: string, surface?: string): void {
  captureEvent(ANALYTICS_EVENTS.LANDING_CTA_CLICKED, { cta, surface });
}
