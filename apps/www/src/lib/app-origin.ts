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
    if (url.protocol !== "https:" && url.protocol !== "http:") return DEV_FALLBACK;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return DEV_FALLBACK;
  }
}

export function appUrl(locale: string, path: string): string {
  return `${appOrigin()}/${locale}${path}`;
}
