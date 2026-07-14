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
} from "./format";

/**
 * Client hook exposing locale-aware, domain-specific formatters bound to the
 * active next-intl locale. These stay custom (rather than next-intl's generic
 * `useFormatter`) because they encode Edura/PRD rules: piasters → EGP, the
 * "ج.م" / "EGP" suffix, and Western-numeral default (`ar-EG-u-nu-latn`).
 *
 * Translations come from next-intl's `useTranslations()`; this is only for
 * numbers, currency, percentages and dates.
 */
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
    formatPercent: (n: number | null | undefined) => formatPercent(n, locale),
    formatDate: (
      v: string | Date | null | undefined,
      opts?: Intl.DateTimeFormatOptions,
    ) => formatDate(v, locale, opts),
    formatWeekdayShort: (dayIndex: number) => formatWeekdayShort(dayIndex, locale),
  };
}
