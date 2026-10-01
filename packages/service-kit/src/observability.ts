import * as Sentry from "@sentry/node";
import { isSentryEnabled, sharedSentryOptions, type ObservabilityIdentity } from "@repo/observability";
import { bindCspReporter } from "./csp-reporter";

// Same policy object the Next apps pass to @sentry/nextjs (redaction, sample
// rates, ignore list); only the SDK differs. Off entirely without a DSN.
export function initSentry(): boolean {
  bindCspReporter();
  if (!isSentryEnabled()) return false;
  Sentry.init({ ...sharedSentryOptions("server") });
  return true;
}

export function captureServerError(
  err: unknown,
  requestId: string,
  identity: ObservabilityIdentity | null,
): void {
  if (!isSentryEnabled()) return;
  try {
    Sentry.withScope((scope) => {
      scope.setTag("request_id", requestId);
      // The same three fields tagSentryUser sets in the Next apps.
      if (identity) {
        scope.setUser({ id: identity.id });
        scope.setTag("user_role", identity.role);
        scope.setTag("center_id", identity.centerId);
      }
      Sentry.captureException(err);
    });
  } catch {}
}

export async function flushSentry(): Promise<void> {
  if (!isSentryEnabled()) return;
  await Sentry.close(2_000).catch(() => undefined);
}
