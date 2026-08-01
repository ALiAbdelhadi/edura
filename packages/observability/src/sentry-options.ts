import { DENY_URLS, IGNORED_ERRORS, redactDeep, redactText, redactUrl } from "./redact";

// =============================================================================
// The Sentry options both apps share.
//
// Written as a FUNCTION returning a plain object rather than a config file each
// app copies, because the interesting parts (PII posture, sampling, scrubbing)
// are exactly the parts that rot when copied. `apps/*/sentry.*.config.ts` are
// thin: DSN + this.
//
// DISABLED BY DEFAULT. No DSN, no Sentry — `isSentryEnabled()` is false, the
// SDK is initialised with an empty DSN and does nothing. Nobody has to remember
// to switch it off for local development or CI.
// =============================================================================

export type SentryRuntime = "client" | "server" | "edge";

export function sentryDsn(): string {
  // NEXT_PUBLIC_ is required for the browser bundle; the server accepts either
  // so a deploy can set one variable rather than two.
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

/**
 * Trace sampling.
 *
 * 10% in production is the deliberate default: this is a K-12 platform in one
 * country, not global-scale traffic, and 100% tracing on a paid plan burns the
 * quota during the one week you actually need it. Errors are ALWAYS captured at
 * 100% — sampling here only affects performance traces.
 */
function tracesSampleRate(): number {
  const isProd = envName() === "production";
  return num(process.env.SENTRY_TRACES_SAMPLE_RATE, isProd ? 0.1 : 0);
}

/**
 * `beforeSend`/`beforeBreadcrumb` are typed loosely ON PURPOSE.
 *
 * Sentry declares them as function PROPERTIES, so under `strictFunctionTypes`
 * their parameters are contravariant: our handler's parameter type would have
 * to be a supertype of Sentry's `ErrorEvent` interface, and no structural type
 * we can write here satisfies that (an interface without an index signature is
 * not assignable to `Record<string, unknown>`).
 *
 * The alternative — importing Sentry's types — would make this package depend
 * on the SDK, and it is imported from browser bundles where pulling the SDK in
 * a second time is exactly what we are avoiding.
 *
 * So the escape hatch lives HERE, once, at the boundary — and the functions it
 * wraps (`scrubEvent`, `scrubBreadcrumb`) are strongly typed and unit-tested
 * against `SentryEventLike`.
 */
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

/**
 * Structurally-typed stand-ins for Sentry's Event/Breadcrumb. Declared locally
 * so this package stays dependency-free and can be imported from a browser
 * bundle without pulling the SDK in twice.
 */
export type SentryEventLike = {
  request?: { url?: string; headers?: Record<string, string>; cookies?: unknown; data?: unknown };
  user?: { id?: string; email?: string; username?: string; ip_address?: string } | null;
  message?: string;
  extra?: Record<string, unknown>;
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
    // Belt and braces: an empty DSN already no-ops, but an explicit `enabled`
    // means a misconfigured deploy fails closed rather than half-reporting.
    enabled: isSentryEnabled(),
    tracesSampleRate: tracesSampleRate(),

    // NEVER send IPs, cookies, headers or request bodies automatically. On this
    // platform an automatically-captured request body can contain a minor's
    // name, a guardian's email, or a password being set.
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

/**
 * Last gate before the wire. Runs on EVERY event, so it is deliberately cheap
 * and total — and it never throws, because a throwing `beforeSend` drops the
 * event silently and you find out months later.
 *
 * Exported and strongly typed so it can be unit-tested directly; the loose
 * typing above is only the SDK handoff.
 */
export function scrubEvent(event: SentryEventLike): SentryEventLike | null {
  try {
    if (event.request) {
      // Cookies and headers carry session tokens. `sendDefaultPii: false`
      // already suppresses most of this; deleting them is the guarantee.
      delete event.request.cookies;
      delete event.request.headers;
      delete event.request.data;
      if (event.request.url) event.request.url = redactUrl(event.request.url);
    }

    // `identity.ts` decides who may be identified. Anything that reached
    // `user` by another route (an SDK integration, a stray setUser) is
    // stripped down to the id here.
    if (event.user) {
      const id = event.user.id;
      event.user = id ? { id } : null;
    }

    if (event.message) event.message = redactText(event.message);
    if (event.extra) event.extra = redactDeep(event.extra) as Record<string, unknown>;
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map(
        (c) => scrubBreadcrumb(c) ?? { message: "[dropped]" },
      );
    }
    return event;
  } catch {
    // If scrubbing itself failed we cannot prove the event is clean, so it
    // does not go. Dropping an error report is strictly better than shipping
    // an unscrubbed one.
    return null;
  }
}

export function scrubBreadcrumb(crumb: SentryBreadcrumbLike): SentryBreadcrumbLike | null {
  try {
    const out: SentryBreadcrumbLike = { ...crumb };
    if (typeof out.message === "string") out.message = redactText(out.message);
    if (out.data) {
      const data = redactDeep(out.data) as Record<string, unknown>;
      // Navigation and fetch crumbs carry raw URLs — the token case again.
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
