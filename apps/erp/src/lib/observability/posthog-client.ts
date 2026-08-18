"use client";

import posthog from "posthog-js";
import {
  isAnalyticsEnabled,
  observabilityIdentity,
  posthogKey,
  sanitizeProperties,
  type AnalyticsEvent,
  type AnalyticsProperties,
  type SessionLike,
} from "@repo/observability";

// =============================================================================
// PostHog, browser side.
//
// THE THREE THINGS THAT ARE OFF, and why each is a decision rather than a
// default:
//
//   * SESSION RECORDING — `disable_session_recording: true`. A recording of a
//     student's screen is their name, their grades, their guardian's email and
//     their teacher's messages, replayable by anyone with a PostHog login. It
//     is off, and `capture_pageleave` etc. cannot turn it back on.
//
//   * AUTOCAPTURE — off. Autocapture records the TEXT CONTENT of clicked
//     elements, which on a roster screen is a list of children's names. The
//     funnel needs six explicit events, not a firehose.
//
//   * PERSON PROFILES FOR ANONYMOUS USERS — `person_profiles: "identified_only"`.
//     Minors are never identified (see @repo/observability/identity), so this is
//     what keeps a minor's traffic from accreting into a person record anyway.
//
// Ingest goes through /ingest on our own origin (see next.config.ts rewrites):
// `*.i.posthog.com` is blocklisted by most ad blockers, which would silently
// cost a large slice of Egyptian traffic.
// =============================================================================

let started = false;

export function initAnalytics(): void {
  if (started || typeof window === "undefined") return;
  if (!isAnalyticsEnabled()) return; // no key => no analytics, anywhere
  started = true;

  posthog.init(posthogKey(), {
    // Same-origin proxy. `ui_host` keeps "open in PostHog" links pointing at
    // the real app rather than at our rewrite.
    api_host: "/ingest",
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",

    disable_session_recording: true,
    autocapture: false,
    capture_pageview: false, // sent manually — see PostHogPageview
    capture_pageleave: true,
    person_profiles: "identified_only",

    // Do not let the SDK collect the URL's query string wholesale: onboarding,
    // invite-claim and reset links all carry a live token there.
    sanitize_properties: (properties) => {
      const out = { ...properties };
      for (const key of ["$current_url", "$referrer", "$pathname"]) {
        const value = out[key];
        if (typeof value === "string") out[key] = stripQuery(value);
      }
      return out;
    },
  });
}

/** Keep the path (that is the funnel step); drop the query (that is the token). */
function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/**
 * Identify the current user — or deliberately DON'T.
 *
 * `observabilityIdentity` returns null for minors and for signed-out visitors.
 * In that case we call `reset()`: the previous person's distinct_id must not
 * follow a shared device (a family laptop, a center's front-desk machine) into
 * the next session.
 */
export function identifyUser(session: SessionLike | null | undefined): void {
  if (!started) return;
  const identity = observabilityIdentity(session);
  if (!identity) {
    posthog.reset();
    return;
  }
  posthog.identify(identity.id, {
    role: identity.role,
    center_id: identity.centerId,
  });
}

/**
 * Capture a funnel event.
 *
 * Properties go through the allowlist in @repo/observability/events, so a
 * careless `{ ...user }` cannot put a name into the warehouse.
 */
export function captureEvent(event: AnalyticsEvent, props?: AnalyticsProperties): void {
  if (!started) return;
  posthog.capture(event, sanitizeProperties(props));
}

/**
 * Page view. Its own function rather than a raw `posthog.capture` at the call
 * site, so the `started` guard cannot be forgotten — posthog-js exports a
 * singleton that is callable before `init()`, where it warns and silently drops
 * the event. That is a failure mode with no error to notice.
 *
 * The QUERY STRING IS NEVER SENT: `/ar/onboarding?token=…` becomes
 * `/ar/onboarding`.
 */
export function capturePageview(pathname: string): void {
  if (!started) return;
  posthog.capture("$pageview", {
    $current_url: `${window.location.origin}${pathname}`,
  });
}
