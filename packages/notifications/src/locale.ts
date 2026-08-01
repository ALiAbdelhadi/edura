import type { Locale } from "./types";

// Re-exported so templates import their locale type from the module that owns
// locale behaviour, not from the message-contract module.
export type { Locale };

/** Arabic is the platform default — an unknown/missing locale is never English. */
export function normalizeLocale(value: string | null | undefined): Locale {
  return value === "en" ? "en" : "ar";
}

export function isRtl(locale: Locale): boolean {
  return locale === "ar";
}

/**
 * Money is stored in piasters (integer) everywhere in this codebase. Formatting
 * lives here so an email can never disagree with a screen about what was paid.
 */
export function formatEgp(piasters: number, locale: Locale): string {
  const pounds = piasters / 100;
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(pounds);
}

export function formatDateTime(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  }).format(date);
}
