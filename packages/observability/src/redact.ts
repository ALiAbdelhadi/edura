export const REDACTED = "[redacted]";

export const REDACTED_PARAM = "REDACTED";

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

export function redactUrl(raw: string): string {
  if (!raw) return raw;
  try {
    const url = new URL(raw, "http://x.invalid");
    let touched = false;
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_PARAM_SET.has(key.toLowerCase())) {
        url.searchParams.set(key, REDACTED_PARAM);
        touched = true;
      }
    }
    if (!touched) return raw;
    return raw.startsWith("http") ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return redactText(raw);
  }
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EG_PHONE_RE = /(?:\+?20|00?20)?0?1[0-2,5]\d{8}/g;
const INLINE_SECRET_RE = new RegExp(
  `\\b(${SENSITIVE_PARAMS.join("|")})\\b(\\s*[=:]\\s*"?)([^\\s"'&,;)]+)`,
  "gi",
);

export function redactText(value: string): string {
  if (!value) return value;
  return value
    .replace(INLINE_SECRET_RE, (_m, key, sep) => `${key}${sep}${REDACTED}`)
    .replace(EMAIL_RE, REDACTED)
    .replace(EG_PHONE_RE, REDACTED);
}

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

export const IGNORED_ERRORS: (string | RegExp)[] = [
  "NEXT_REDIRECT",
  "NEXT_NOT_FOUND",
  "NEXT_HTTP_ERROR_FALLBACK",
  "AbortError",
  "The user aborted a request",
  /^Failed to fetch$/,
  /^NetworkError when attempting to fetch resource/,
  /^Load failed$/,
  /ResizeObserver loop/,
  "Non-Error promise rejection captured",
  /^chrome-extension:/,
  /^moz-extension:/,
];

export const DENY_URLS: RegExp[] = [
  /extensions\//i,
  /^chrome:\/\//i,
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
];
