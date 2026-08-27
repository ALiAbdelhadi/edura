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

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (!isAnalyticsEnabled()) return null;
  if (client) return client;
  client = new PostHog(posthogKey(), {
    host: posthogHost(),
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

export async function captureServerEvent(
  session: SessionLike | null | undefined,
  event: AnalyticsEvent,
  props?: AnalyticsProperties,
): Promise<boolean> {
  try {
    const ph = getClient();
    if (!ph) return false;

    const identity = observabilityIdentity(session);
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
    await ph.flush();
    return true;
  } catch (err) {
    console.error(
      `[analytics] ${event} not captured: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

export function captureServerEventInBackground(
  session: SessionLike | null | undefined,
  event: AnalyticsEvent,
  props?: AnalyticsProperties,
): void {
  void captureServerEvent(session, event, props);
}
