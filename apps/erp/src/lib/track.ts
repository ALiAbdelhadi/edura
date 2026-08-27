import type { AnalyticsEvent, AnalyticsProperties } from "@repo/observability";

export type TrackEvent = AnalyticsEvent;

export type TrackProps = AnalyticsProperties;

let sink: ((event: TrackEvent, props: TrackProps) => void) | null = null;

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
  }
}
