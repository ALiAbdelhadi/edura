import { defineRouting } from "next-intl/routing";

/**
 * Mirrors apps/www/src/i18n/routing.ts exactly — same locales, same Arabic
 * default, same always-prefixed paths. The showcase links into the main app's
 * /login and /register, so a visitor who switches language here must land on
 * the matching locale there; that only holds if both apps agree on the shape
 * of a locale path.
 */
export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: "ar",
  localePrefix: "always",
  localeDetection: true,
});

export type Locale = (typeof routing.locales)[number];

export const RTL_LOCALES: readonly Locale[] = ["ar"];

export function isRtlLocale(locale: string): boolean {
  return (RTL_LOCALES as readonly string[]).includes(locale);
}
