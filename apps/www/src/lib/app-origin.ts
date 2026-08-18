/**
 * The public origin of the PRODUCT app (apps/erp) — where every login and
 * register CTA on this marketing site resolves.
 *
 * Mirror of the app's own `marketingSiteUrl()`, which points the other way
 * (its signed-out root redirects here). `NEXT_PUBLIC_` because these links
 * render in server components but must also survive any client render.
 *
 * Falls back to the app's dev port so local clicks land somewhere real; in a
 * production build without the env the links would be dead for every visitor,
 * so the build warns loudly (same posture the old showcase took — warn, not
 * throw, because CI builds with no deployment env).
 */
const DEV_FALLBACK = "http://localhost:3002";

export function appOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[www] NEXT_PUBLIC_APP_ORIGIN is unset — login/register CTAs resolve to localhost and are dead for every visitor.",
      );
    }
    return DEV_FALLBACK;
  }
  try {
    const url = new URL(raw);
    // These strings become href targets; never emit a non-http(s) scheme.
    if (url.protocol !== "https:" && url.protocol !== "http:") return DEV_FALLBACK;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return DEV_FALLBACK;
  }
}

/** `appUrl("ar", "/login")` → `https://app.…/ar/login`. */
export function appUrl(locale: string, path: string): string {
  return `${appOrigin()}/${locale}${path}`;
}
