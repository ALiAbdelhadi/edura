import { PostHog } from "posthog-node";
import {
  isAnalyticsEnabled,
  observabilityIdentity,
  posthogHost,
  posthogKey,
  sanitizeProperties,
  type AnalyticsEvent,
  type AnalyticsProperties,
  type SessionLike,
} from "@repo/observability";

// =============================================================================
// PostHog, server side. For the funnel steps that are FACTS, not clicks:
// an account was created, a group exists, money moved.
//
// WHY THE FUNNEL HAS NO STUDENT EVENTS.
// The funnel is the CENTER/TEACHER activation journey — signed up, added a
// teacher, created a group, added a student, took a payment. Every actor in it
// is an adult running a business. Students appear in it only as the OBJECT of
// "first student added", never as a tracked subject, so the "minors are
// anonymous pageviews only" rule costs the funnel nothing: there is no step a
// minor would have generated.
//
// `observabilityIdentity` still gates every call, so if a student ever did
// reach one of these paths the event is dropped rather than attributed.
// =============================================================================

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (!isAnalyticsEnabled()) return null;
  if (client) return client;
  client = new PostHog(posthogKey(), {
    host: posthogHost(),
    // Server events are low-volume and high-value (a signup, a first payment).
    // Small batches keep them from sitting in a buffer that a serverless
    // instance then discards when it is frozen.
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

/**
 * Capture a server-side funnel event.
 *
 * NEVER THROWS. Every call site is after a committed write; analytics may not
 * be able to fail a registration or un-settle a payment.
 *
 * Returns `false` when nothing was sent — analytics off, or the actor is one we
 * do not identify.
 */
export async function captureServerEvent(
  session: SessionLike | null | undefined,
  event: AnalyticsEvent,
  props?: AnalyticsProperties,
): Promise<boolean> {
  try {
    const ph = getClient();
    if (!ph) return false;

    const identity = observabilityIdentity(session);
    // No identity => no event. Deliberately NOT falling back to an anonymous
    // capture: an unattributed funnel step is noise, and for a minor the whole
    // point is that nothing is recorded.
    if (!identity) return false;

    ph.capture({
      distinctId: identity.id,
      event,
      properties: {
        ...sanitizeProperties(props),
        role: identity.role,
        center_id: identity.centerId,
      },
    });
    // flushAt:1 means this resolves once the event is actually away, which
    // matters on serverless where the instance may be frozen immediately after.
    await ph.flush();
    return true;
  } catch (err) {
    console.error(
      `[analytics] ${event} not captured: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

/**
 * Fire-and-forget variant for post-commit hooks that should not wait on the
 * network. Use `captureServerEvent` directly when the handler is about to
 * return anyway and you would rather the event be flushed first.
 */
export function captureServerEventInBackground(
  session: SessionLike | null | undefined,
  event: AnalyticsEvent,
  props?: AnalyticsProperties,
): void {
  void captureServerEvent(session, event, props);
}
