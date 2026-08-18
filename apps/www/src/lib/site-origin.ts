/**
 * The public origin of THIS site.
 *
 * Distinct from `app-origin.ts`, which points at the product app. This one is
 * what the sitemap, `robots.txt`, canonicals and hreflang emit — absolute URLs
 * that a crawler resolves from outside, where a relative path is meaningless.
 *
 * Resolution order, and the fallback is the point:
 *  1. `NEXT_PUBLIC_SITE_URL` — an explicit pin, for when the final domain is
 *     not the Vercel project's own.
 *  2. `VERCEL_PROJECT_PRODUCTION_URL` — set by Vercel, and it AUTO-UPGRADES the
 *     moment a custom domain is attached. So attaching the real domain fixes
 *     every canonical with no config change, which is why #1 should stay unset
 *     unless it is genuinely needed.
 *  3. localhost, for `bun run dev`.
 *
 * WHY THIS FILE EXISTS AT ALL: without it the sitemap has no absolute base and
 * quietly emits `http://localhost:3010/...` from a production build — a sitemap
 * of URLs that resolve to nobody's machine, submitted to a search engine that
 * believes it. That exact bug has shipped in this repo before (www once served
 * `<link rel="canonical" href="http://localhost:3002/…">`), so the production
 * build WARNS when it is falling back.
 */
const DEV_FALLBACK = "http://localhost:3010";

function normalize(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  // `VERCEL_PROJECT_PRODUCTION_URL` arrives as a bare host, with no scheme.
  const withScheme = /^https?:\/\//.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function siteOrigin(): string {
  const explicit = normalize(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  if (explicit) return explicit;

  const vercel = normalize(process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "");
  if (vercel) return vercel;

  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[www] neither NEXT_PUBLIC_SITE_URL nor VERCEL_PROJECT_PRODUCTION_URL is set — " +
        "the sitemap, robots.txt and every canonical will emit localhost.",
    );
  }
  return DEV_FALLBACK;
}

/** `siteUrl("ar", "/pricing")` → `https://…/ar/pricing`. */
export function siteUrl(locale: string, path = ""): string {
  return `${siteOrigin()}/${locale}${path}`;
}
