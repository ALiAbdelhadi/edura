"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { capturePageview, captureEvent, initAnalytics } from "./posthog-client";
import { registerTrackSink } from "@/lib/track";
import { ANALYTICS_EVENTS } from "@repo/observability";

/**
 * Mount once, high in the tree. Does nothing at all when
 * NEXT_PUBLIC_POSTHOG_KEY is unset — which is every local and CI run.
 *
 * Init, pageviews and the `track()` sink only. WHO the visitor is is not this
 * component's business any more: it took a `session` prop that the root layout
 * filled with `await getSessionUser()`, and that one cookie read made every page
 * in the app dynamic. Identity now comes from `AnalyticsIdentity`, mounted by
 * the portal layouts that read the session anyway — see the note in that file.
 */
export function AnalyticsProvider({ children }: { children?: React.ReactNode }) {
  useEffect(() => {
    initAnalytics();
    // Point the app-wide `track()` seam at PostHog. Registering it HERE rather
    // than importing captureEvent inside lib/track.ts is what keeps posthog-js
    // out of the import graph of every component that records a click —
    // including server components that merely import a module which imports
    // track. captureEvent is itself guarded by `started`, so registering before
    // (or without) a PostHog key is harmless.
    registerTrackSink(captureEvent);
  }, []);

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
