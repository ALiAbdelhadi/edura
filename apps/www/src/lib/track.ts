/**
 * Product analytics — the SEAM, not the implementation.
 *
 * Every conversion surface in this workstream calls `track()`. Today it is a
 * no-op (a `console.debug` in development so the events are visible while
 * building). The PostHog client lands in a sibling workstream; wiring it is a
 * one-function change inside `deliver()` below, and NOT a hunt through the
 * component tree for call sites that were never written.
 *
 * Rules this helper enforces so the seam stays safe:
 *  1. It NEVER throws. An analytics failure must not break a page — every call
 *     is wrapped, and a broken sink degrades to silence.
 *  2. It carries NO personal data. `TrackProps` is a flat map of primitives and
 *     the call sites pass counts, plan names, locales and step ids — never a
 *     name, email, phone, student id, or any money figure. The event names are
 *     an explicit union so a new event is a deliberate edit here.
 *  3. It is client-only by design. Calling it during SSR is a no-op rather than
 *     an error, so a component can call it from an effect without guarding.
 */

export type TrackEvent =
  // Conversion surface
  | "cta_clicked"
  | "demo_requested"
  | "contact_submitted"
  | "contact_failed"
  // Content surface
  | "help_article_viewed"
  | "faq_opened"
  | "pricing_example_changed"
  // Activation surface
  | "onboarding_checklist_viewed"
  | "onboarding_checklist_step_clicked"
  | "onboarding_checklist_dismissed"
  | "empty_state_cta_clicked";

/** Flat, non-identifying event properties. */
export type TrackProps = Record<string, string | number | boolean | null | undefined>;

/**
 * The sink. Replaced post-merge by the PostHog capture call:
 *
 *   posthog.capture(event, props)
 *
 * Kept as a module-level binding (not an import) so this file has ZERO
 * dependencies and can be imported from any client component without pulling a
 * vendor bundle into a route that does not need one.
 */
let sink: ((event: TrackEvent, props: TrackProps) => void) | null = null;

/**
 * Register the real analytics sink. Workstream 2 calls this once from its
 * PostHog provider; until then nothing is registered and `track` stays silent.
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
