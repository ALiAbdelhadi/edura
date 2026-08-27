const DEV_FALLBACK = "http://localhost:3010";

function normalize(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
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

export function siteUrl(locale: string, path = ""): string {
  return `${siteOrigin()}/${locale}${path}`;
}
