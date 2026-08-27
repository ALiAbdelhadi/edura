import * as Sentry from "@sentry/nextjs";
import { observabilityIdentity, type SessionLike } from "@repo/observability";

export function tagSentryUser(session: SessionLike | null | undefined): void {
  try {
    const identity = observabilityIdentity(session);
    if (!identity) {
      Sentry.setUser(null);
      Sentry.setTag("user_role", undefined);
      Sentry.setTag("center_id", undefined);
      return;
    }

    Sentry.setUser({ id: identity.id });
    Sentry.setTag("user_role", identity.role);
    Sentry.setTag("center_id", identity.centerId);
  } catch {}
}
