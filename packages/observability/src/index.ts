// =============================================================================
// @repo/observability — what Sentry and PostHog are allowed to see.
//
// Dependency-free by design: imported from browser bundles, Node handlers and
// the edge runtime, so neither vendor SDK may appear here.
//
// The two rules that everything else serves:
//   1. IDs only — never a name, email, phone, or anything a human typed.
//   2. Minors are not identified at all (see identity.ts `isMinorRole`).
// =============================================================================

export {
  isMinorRole,
  observabilityIdentity,
  type ObservabilityIdentity,
  type ObservabilityRole,
  type SessionLike,
} from "./identity";

export {
  DENY_URLS,
  IGNORED_ERRORS,
  REDACTED,
  REDACTED_PARAM,
  redactDeep,
  redactText,
  redactUrl,
} from "./redact";

export {
  isSentryEnabled,
  sentryDsn,
  scrubBreadcrumb,
  scrubEvent,
  sharedSentryOptions,
  type SentryBreadcrumbLike,
  type SentryEventLike,
  type SentryRuntime,
  type SharedSentryOptions,
} from "./sentry-options";

export {
  ALLOWED_PROPERTIES,
  ANALYTICS_EVENTS,
  isAnalyticsEnabled,
  posthogHost,
  posthogKey,
  sanitizeProperties,
  type AnalyticsEvent,
  type AnalyticsProperties,
} from "./events";
