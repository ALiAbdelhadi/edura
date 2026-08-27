import type { Locale } from "./types";

export type { Locale };

export function normalizeLocale(value: string | null | undefined): Locale {
  return value === "en" ? "en" : "ar";
}

export function isRtl(locale: Locale): boolean {
  return locale === "ar";
}

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
