export const LOCALES = ["ar", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ar";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** The other locale — the language switch is a toggle, not a menu. */
export function otherLocale(locale: Locale): Locale {
  return locale === "ar" ? "en" : "ar";
}
