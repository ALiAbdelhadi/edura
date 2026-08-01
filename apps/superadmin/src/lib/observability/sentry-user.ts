import * as Sentry from "@sentry/nextjs";
import { observabilityIdentity, type SessionLike } from "@repo/observability";

/**
 * Attach the current actor to the Sentry scope for this request.
 *
 * WHAT GOES: user id, role, centerId. WHAT NEVER GOES: name, email, phone, IP.
 * `observabilityIdentity` is the single decider (it returns `null` for minors),
 * and this function has no branch that can disagree with it.
 *
 * Called from `getSessionUser()`, which is THE session surface — so tagging
 * follows the session automatically and no route has to remember to do it.
 *
 * NEVER THROWS. Observability failing must not take down a request; when Sentry
 * is disabled (no DSN) every call here is already a no-op inside the SDK.
 */
export function tagSentryUser(session: SessionLike | null | undefined): void {
  try {
    const identity = observabilityIdentity(session);
    if (!identity) {
      // Unidentified traffic. For a minor this is the intended end state, so
      // the scope is CLEARED rather than left holding whoever came before it on
      // a reused server instance.
      Sentry.setUser(null);
      Sentry.setTag("user_role", undefined);
      Sentry.setTag("center_id", undefined);
      return;
    }

    Sentry.setUser({ id: identity.id });
    // Tags, not user fields: these are what you filter an issue list by
    // ("every center_admin in center X"), which is the actual operational need.
    Sentry.setTag("user_role", identity.role);
    Sentry.setTag("center_id", identity.centerId);
  } catch {
    // Deliberately silent — a failure here is not worth a log line on every
    // request, and there is nothing a reader could act on.
  }
}
