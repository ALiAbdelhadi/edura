// =============================================================================
// Scrubbing. What leaves the process, after `identity.ts` has decided who.
//
// The threat is not a developer typing a password into a log line — it is the
// AUTOMATIC capture that error and analytics SDKs do: full URLs (which on this
// platform carry single-use claim tokens), request bodies, breadcrumbs.
//
// Everything here is deny-by-pattern on the way OUT. It is the second layer;
// the first is not sending the data at all (`sendDefaultPii: false`, no session
// replay, no request bodies).
// =============================================================================

export const REDACTED = "[redacted]";

/**
 * The same marker for QUERY-STRING values. Deliberately bracket-free:
 * `URLSearchParams.set` percent-encodes `[` and `]`, so the readable
 * `[redacted]` arrives in the Sentry UI as `%5Bredacted%5D` — which reads like
 * a bug in our redaction rather than the redaction working.
 */
export const REDACTED_PARAM = "REDACTED";

/**
 * Query parameters whose VALUE is a credential or a direct identifier.
 *
 * `token` is the one that matters most: invite-claim, walk-in onboarding,
 * password reset and the student onboarding deep link all carry a live,
 * single-use token in the query string. A URL captured verbatim into an error
 * report is a credential in a third party's database.
 */
const SENSITIVE_PARAMS = [
  "token",
  "access_token",
  "refresh_token",
  "code",
  "secret",
  "password",
  "hmac",
  "signature",
  "key",
  "apikey",
  "api_key",
  "email",
  "phone",
  "otp",
];

const SENSITIVE_PARAM_SET = new Set(SENSITIVE_PARAMS);

/** Redact sensitive query-string values, keeping the path and shape intact. */
export function redactUrl(raw: string): string {
  if (!raw) return raw;
  try {
    // `base` lets this work on relative paths too — Next gives us both.
    const url = new URL(raw, "http://x.invalid");
    let touched = false;
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_PARAM_SET.has(key.toLowerCase())) {
        url.searchParams.set(key, REDACTED_PARAM);
        touched = true;
      }
    }
    if (!touched) return raw;
    // Preserve relative-ness: a path that came in relative goes out relative.
    return raw.startsWith("http") ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    // An unparseable string still gets the text-level pass below.
    return redactText(raw);
  }
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Egyptian mobiles: 01X XXXX XXXX, with or without +20 / 0020.
const EG_PHONE_RE = /(?:\+?20|00?20)?0?1[0-2,5]\d{8}/g;
// `token=` / `token: ` / `"token":"..."` in free text (error messages, SQL).
const INLINE_SECRET_RE = new RegExp(
  `\\b(${SENSITIVE_PARAMS.join("|")})\\b(\\s*[=:]\\s*"?)([^\\s"'&,;)]+)`,
  "gi",
);

/** Redact identifiers and secrets inside free text (messages, breadcrumbs). */
export function redactText(value: string): string {
  if (!value) return value;
  return value
    .replace(INLINE_SECRET_RE, (_m, key, sep) => `${key}${sep}${REDACTED}`)
    .replace(EMAIL_RE, REDACTED)
    .replace(EG_PHONE_RE, REDACTED);
}

/**
 * Walk an arbitrary structure, redacting strings. Depth-bounded so a cyclic or
 * pathological payload cannot turn a `beforeSend` hook into a hang on the
 * request path.
 */
export function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return value;
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_PARAM_SET.has(k.toLowerCase()) ? REDACTED : redactDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

// -----------------------------------------------------------------------------
// Noise
// -----------------------------------------------------------------------------

/**
 * Errors that are control flow, not faults.
 *
 * `NEXT_REDIRECT` and `NEXT_NOT_FOUND` are how `redirect()` and `notFound()`
 * work — every auth bounce throws one. Left unfiltered they are, by volume, the
 * loudest thing in the project, and an alert channel nobody trusts is worse
 * than no alert channel.
 */
export const IGNORED_ERRORS: (string | RegExp)[] = [
  "NEXT_REDIRECT",
  "NEXT_NOT_FOUND",
  "NEXT_HTTP_ERROR_FALLBACK",
  // The user navigated away mid-request. Not a fault.
  "AbortError",
  "The user aborted a request",
  /^Failed to fetch$/,
  /^NetworkError when attempting to fetch resource/,
  /^Load failed$/,
  // Benign browser noise with no actionable signal.
  /ResizeObserver loop/,
  "Non-Error promise rejection captured",
  // Extensions and injected scripts, not our code.
  /^chrome-extension:/,
  /^moz-extension:/,
];

/** Third-party script origins whose errors are never ours to fix. */
export const DENY_URLS: RegExp[] = [
  /extensions\//i,
  /^chrome:\/\//i,
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
];
