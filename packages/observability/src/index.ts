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
