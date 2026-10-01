import * as Sentry from "@sentry/node";
import { isSentryEnabled } from "@repo/observability";
import { setCspReporter } from "@repo/server-core/observability/csp-report";

// The service side of the CSP reporter seam: the same capture the Next app
// hands to @sentry/nextjs goes to @sentry/node here. Off entirely without a
// DSN, like captureServerError.
export function bindCspReporter(): void {
  setCspReporter((c) => {
    if (!isSentryEnabled()) return;
    try {
      Sentry.captureMessage(c.message, {
        level: c.level,
        tags: c.tags,
        extra: c.extra,
        fingerprint: c.fingerprint,
      });
    } catch {}
  });
}
