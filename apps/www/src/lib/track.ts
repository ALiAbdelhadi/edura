/**
 * Product analytics — the SEAM, not the implementation.
 *
 * Every conversion surface calls `track()`. The seam exists so the call sites
 * were written before the analytics client did, and so the client can be
 * swapped without touching them. PostHog is registered into it at runtime by
 * `AnalyticsProvider`; nothing here imports posthog-js, which is what keeps a
 * browser SDK out of the import graph of any module that merely wants to
 * record that a button was clicked.
 *
 * Rules this helper enforces so the seam stays safe:
 *  1. It NEVER throws. An analytics failure must not break a page — every call
 *     is wrapped, and a broken sink degrades to silence.
 *  2. It carries NO personal data. Event NAMES come from the shared registry in
 *     @repo/observability, and PROPERTIES pass that package's allowlist before
 *     they reach PostHog — so a careless spread cannot put a name or an email
 *     into the warehouse even if a call site tries.
 *  3. It is client-only by design. Calling it during SSR is a no-op rather than
 *     an error, so a component can call it from an effect without guarding.
 */

import type { AnalyticsEvent, AnalyticsProperties } from "@repo/observability";

/**
 * The closed set from @repo/observability — deliberately NOT a second local
 * union. Two registries would let `contact_submitted` and `contactSubmitted`
 * both exist and split one funnel in half with no error anywhere.
 */
export type TrackEvent = AnalyticsEvent;

/** Flat, non-identifying event properties. */
export type TrackProps = AnalyticsProperties;

/**
 * The sink. A module-level binding rather than an import, so this file pulls in
 * no vendor bundle: `AnalyticsProvider` (already a client component that owns
 * posthog-js) registers `captureEvent` here on mount.
 *
 * Unregistered is a legitimate state, not a broken one — it is what every local
 * run, every CI run and every deployment without NEXT_PUBLIC_POSTHOG_KEY looks
 * like, and `track()` is silent in all of them.
 */
let sink: ((event: TrackEvent, props: TrackProps) => void) | null = null;

/**
 * Register the real analytics sink. Called once from `AnalyticsProvider`.
 */
export function registerTrackSink(fn: (event: TrackEvent, props: TrackProps) => void) {
  sink = fn;
}

export function track(event: TrackEvent, props: TrackProps = {}): void {
  if (typeof window === "undefined") return;
  try {
    if (sink) {
      sink(event, props);
      return;
    }
    if (process.env.NODE_ENV === "development") {
      console.debug("[track]", event, props);
    }
  } catch {
    // Analytics must never take a page down with it.
  }
}
