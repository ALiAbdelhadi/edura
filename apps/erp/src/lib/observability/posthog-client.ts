"use client";

import {
  isAnalyticsEnabled,
  observabilityIdentity,
  posthogKey,
  sanitizeProperties,
  type AnalyticsEvent,
  type AnalyticsProperties,
  type SessionLike,
} from "@repo/observability";

type PostHog = typeof import("posthog-js").default;

let posthog: PostHog | null = null;
let started = false;

// posthog-js is ~257 KB of client JS and it used to be a static import here,
// which put it in the initial bundle of EVERY route — including /terms and
// /login, which never identify anyone. It is loaded on demand instead. The
// queue matters: init() resolves a tick or more after the caller fires, and
// without it every event raised in that window would be dropped silently.
const pending: Array<(ph: PostHog) => void> = [];

function whenReady(run: (ph: PostHog) => void): void {
  if (posthog) {
    run(posthog);
    return;
  }
  pending.push(run);
}

export function initAnalytics(): void {
  if (started || typeof window === "undefined") return;
  if (!isAnalyticsEnabled()) return; // no key => no analytics, anywhere
  started = true;

  void import("posthog-js")
    .then(({ default: ph }) => {
      ph.init(posthogKey(), {
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
      posthog = ph;
      for (const run of pending.splice(0)) run(ph);
    })
    .catch(() => {
      // A blocked or failed chunk must not leave callers queueing forever.
      started = false;
      pending.length = 0;
    });
}

function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

export function identifyUser(session: SessionLike | null | undefined): void {
  if (!started) return;
  const identity = observabilityIdentity(session);
  whenReady((ph) => {
    if (!identity) {
      ph.reset();
      return;
    }
    ph.identify(identity.id, {
      role: identity.role,
      center_id: identity.centerId,
    });
  });
}

export function captureEvent(event: AnalyticsEvent, props?: AnalyticsProperties): void {
  if (!started) return;
  const clean = sanitizeProperties(props);
  whenReady((ph) => ph.capture(event, clean));
}

export function capturePageview(pathname: string): void {
  if (!started) return;
  const url = `${window.location.origin}${pathname}`;
  whenReady((ph) => ph.capture("$pageview", { $current_url: url }));
}
