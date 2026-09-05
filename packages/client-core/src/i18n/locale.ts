/**
 * The locale set, identical in both apps and in the marketing site.
 *
 * Only the vocabulary lives here -- each app's own `lib/i18n/index.ts` still
 * owns its message dictionaries, which are genuinely different (the ERP merges
 * fourteen namespace files, the back office five).
 */
export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";

export function isLocale(v: string | undefined): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

export const RTL_LOCALES: readonly Locale[] = ["ar"];

export function isRtlLocale(locale: string): boolean {
  return (RTL_LOCALES as readonly string[]).includes(locale);
}
