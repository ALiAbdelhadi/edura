import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "@repo/observability";

// Browser runtime. Next 15.3+ loads this file automatically on the client.
//
// WHAT IS DELIBERATELY ABSENT:
//   * Session Replay — it records the DOM, which on this platform means a
//     minor's name, their grades, and a guardian's email. Not enabled, and not
//     an oversight. (The brief bans it for PostHog; the same reasoning applies
//     to Sentry's, which is the one people forget.)
//   * `sendDefaultPii` — false, from the shared options. No IPs.
//
// A user is attached ONLY through @repo/observability's identity rules — see
// sentry-user.ts. Minors are never identified.
Sentry.init({
  ...sharedSentryOptions("client"),
});

/** Required by Next's App Router to report client-side navigation spans. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
