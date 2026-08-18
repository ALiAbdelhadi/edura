/**
 * The public origin of the MARKETING site (apps/showcase).
 *
 * The signed-out landing page used to live here, at `/{locale}`. It now lives
 * in apps/showcase, which is deployed separately on its own domain, so this
 * app's root redirects there instead of rendering a second copy. Keeping two
 * landing pages is how the two drift: the showcase already owns the canonical
 * URLs for it (its sitemap lists `/{locale}` at priority 1).
 *
 * This is the mirror of the showcase's own `NEXT_PUBLIC_APP_ORIGIN`, which
 * points the other way — its login/register CTAs come back here.
 *
 * Returns null when unset rather than guessing: `VERCEL_PROJECT_PRODUCTION_URL`
 * holds THIS deployment's domain, so deriving from it would redirect the app's
 * root to the app itself — a loop. Callers fall back to a page that exists.
 */
export function marketingSiteUrl(): string | null {
  const raw = process.env.MARKETING_SITE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    // This string becomes a Location header; a non-http(s) scheme must never
    // reach it. Same validation as `demoBookingUrl()`.
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}
