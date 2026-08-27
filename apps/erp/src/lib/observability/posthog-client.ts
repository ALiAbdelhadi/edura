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

let started = false;

export function initAnalytics(): void {
  if (started || typeof window === "undefined") return;
  if (!isAnalyticsEnabled()) return; // no key => no analytics, anywhere
  started = true;

  posthog.init(posthogKey(), {
    api_host: "/ingest",
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",

    disable_session_recording: true,
    autocapture: false,
    capture_pageview: false, // sent manually — see PostHogPageview
    capture_pageleave: true,
    person_profiles: "identified_only",

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

function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

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

export function captureEvent(event: AnalyticsEvent, props?: AnalyticsProperties): void {
  if (!started) return;
  posthog.capture(event, sanitizeProperties(props));
}

export function capturePageview(pathname: string): void {
  if (!started) return;
  posthog.capture("$pageview", {
    $current_url: `${window.location.origin}${pathname}`,
  });
}
