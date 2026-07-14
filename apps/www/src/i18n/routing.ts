import { defineRouting } from "next-intl/routing";

/**
 * next-intl routing config — single source of truth for locales.
 *
 * Mirrors the previous custom setup: Arabic-first (Egypt/EGP market),
 * English fallback, every route locale-prefixed (/ar, /en).
 */
export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: "ar",
  localePrefix: "always",
  // Accept-Language negotiation + NEXT_LOCALE cookie persistence (next-intl default).
  localeDetection: true,
});

export type Locale = (typeof routing.locales)[number];

/** Locales that render right-to-left. */
export const RTL_LOCALES: readonly Locale[] = ["ar"];

export function isRtlLocale(locale: string): boolean {
  return (RTL_LOCALES as readonly string[]).includes(locale);
}
