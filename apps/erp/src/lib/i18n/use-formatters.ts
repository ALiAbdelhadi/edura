"use client";

import { useLocale } from "next-intl";
import { isRtlLocale } from "@/i18n/routing";
import type { Locale } from "./index";
import {
  formatEGP,
  formatShortEGP,
  formatNumber,
  formatPercent,
  formatDate,
  formatWeekdayShort,
  formatClock,
  formatClockRange,
  formatClockText,
} from "./format";

export function useFormatters() {
  const locale = useLocale() as Locale;
  const dir: "rtl" | "ltr" = isRtlLocale(locale) ? "rtl" : "ltr";

  return {
    locale,
    dir,
    formatEGP: (
      piasters: number | null | undefined,
      opts?: { arabicNumerals?: boolean; decimals?: boolean },
    ) => formatEGP(piasters, locale, opts),
    formatShortEGP: (piasters: number | null | undefined) =>
      formatShortEGP(piasters, locale),
    formatNumber: (n: number | null | undefined) => formatNumber(n, locale),
    formatPercent: (n: number | null | undefined, opts?: { decimals?: number }) =>
      formatPercent(n, locale, opts),
    formatDate: (
      v: string | Date | null | undefined,
      opts?: Intl.DateTimeFormatOptions,
    ) => formatDate(v, locale, opts),
    formatWeekdayShort: (dayIndex: number) =>
      formatWeekdayShort(dayIndex, locale),
    formatClock: (v: string | null | undefined) => formatClock(v, locale),
    formatClockRange: (
      start: string | null | undefined,
      end: string | null | undefined,
    ) => formatClockRange(start, end, locale),
    formatClockText: (v: string | null | undefined) => formatClockText(v, locale),
  };
}
