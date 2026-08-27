import { DENY_URLS, IGNORED_ERRORS, redactDeep, redactText, redactUrl } from "./redact";

export type SentryRuntime = "client" | "server" | "edge";

export function sentryDsn(): string {
  return process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN ?? "";
}

export function isSentryEnabled(): boolean {
  return sentryDsn().length > 0;
}

function envName(): string {
  return process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development";
}

function num(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

function tracesSampleRate(): number {
  const isProd = envName() === "production";
  return num(process.env.SENTRY_TRACES_SAMPLE_RATE, isProd ? 0.1 : 0);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type SharedSentryOptions = {
  dsn: string;
  environment: string;
  enabled: boolean;
  tracesSampleRate: number;
  sendDefaultPii: false;
  ignoreErrors: (string | RegExp)[];
  denyUrls?: RegExp[];
  beforeSend: (event: any) => any;
  beforeBreadcrumb: (crumb: any) => any;
  release?: string;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export type SentryEventLike = {
  request?: { url?: string; headers?: Record<string, string>; cookies?: unknown; data?: unknown };
  user?: { id?: string; email?: string; username?: string; ip_address?: string } | null;
  message?: string;
  exception?: { values?: { type?: string; value?: string }[] };
  logentry?: { message?: string; params?: unknown[] };
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  breadcrumbs?: SentryBreadcrumbLike[];
  [key: string]: unknown;
};

export type SentryBreadcrumbLike = {
  message?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export function sharedSentryOptions(runtime: SentryRuntime): SharedSentryOptions {
  return {
    dsn: sentryDsn(),
    environment: envName(),
    enabled: isSentryEnabled(),
    tracesSampleRate: tracesSampleRate(),

    sendDefaultPii: false,

    ignoreErrors: IGNORED_ERRORS,
    ...(runtime === "client" ? { denyUrls: DENY_URLS } : {}),

    ...(process.env.NEXT_PUBLIC_SENTRY_RELEASE
      ? { release: process.env.NEXT_PUBLIC_SENTRY_RELEASE }
      : {}),

    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}

export function scrubEvent(event: SentryEventLike): SentryEventLike | null {
  try {
    if (event.request) {
      delete event.request.cookies;
      delete event.request.headers;
      delete event.request.data;
      if (event.request.url) event.request.url = redactUrl(event.request.url);
    }

    if (event.user) {
      const id = event.user.id;
      event.user = id ? { id } : null;
    }

    if (event.message) event.message = redactText(event.message);

    if (event.exception?.values) {
      for (const v of event.exception.values) {
        if (typeof v.value === "string") v.value = redactText(v.value);
      }
    }
    if (event.logentry?.message) event.logentry.message = redactText(event.logentry.message);

    if (event.extra) event.extra = redactDeep(event.extra) as Record<string, unknown>;
    if (event.contexts) event.contexts = redactDeep(event.contexts) as Record<string, unknown>;
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map(
        (c) => scrubBreadcrumb(c) ?? { message: "[dropped]" },
      );
    }
    return event;
  } catch {
    return null;
  }
}

export function scrubBreadcrumb(crumb: SentryBreadcrumbLike): SentryBreadcrumbLike | null {
  try {
    const out: SentryBreadcrumbLike = { ...crumb };
    if (typeof out.message === "string") out.message = redactText(out.message);
    if (out.data) {
      const data = redactDeep(out.data) as Record<string, unknown>;
      for (const key of ["url", "from", "to"]) {
        if (typeof data[key] === "string") data[key] = redactUrl(data[key] as string);
      }
      out.data = data;
    }
    return out;
  } catch {
    return null;
  }
}
