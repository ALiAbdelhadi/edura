import type { Locale } from "./index";

function intlLocale(locale: Locale, arabicNumerals = false): string {
  if (locale === "ar") return arabicNumerals ? "ar-EG" : "ar-EG-u-nu-latn";
  return "en-US";
}

export function formatEGP(
  piasters: number | null | undefined,
  locale: Locale,
  opts?: { arabicNumerals?: boolean; decimals?: boolean },
): string {
  const egp = (piasters ?? 0) / 100;
  const nf = new Intl.NumberFormat(intlLocale(locale, opts?.arabicNumerals), {
    minimumFractionDigits: opts?.decimals ? 2 : 0,
    maximumFractionDigits: opts?.decimals ? 2 : 0,
  });
  const num = nf.format(egp);
  return locale === "ar" ? `${num} ج.م` : `${num} EGP`;
}

export function formatShortEGP(piasters: number | null | undefined, locale: Locale): string {
  const egp = Math.round((piasters ?? 0) / 100);
  const suffix = locale === "ar" ? "ج.م" : "EGP";
  if (Math.abs(egp) >= 1000) {
    const nf = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 });
    return `${nf.format(egp / 1000)}k ${suffix}`;
  }
  return `${new Intl.NumberFormat(intlLocale(locale)).format(egp)} ${suffix}`;
}

export function formatNumber(value: number | null | undefined, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value ?? 0);
}

export function formatPercent(value: number | null | undefined, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(value ?? 0) +
    (locale === "ar" ? "٪" : "%");
}

export function formatDate(
  value: string | Date | null | undefined,
  locale: Locale,
  opts?: Intl.DateTimeFormatOptions,
): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(
    intlLocale(locale),
    opts ?? { year: "numeric", month: "short", day: "numeric" },
  ).format(d);
}

/**
 * Locale-aware short weekday name from a 0=Sunday..6=Saturday index — replaces
 * hardcoded `["Sun","Mon",…]` arrays so Arabic renders Arabic day names.
 * 2023-01-01 is a Sunday; add the index to land on the right weekday.
 */
export function formatWeekdayShort(dayIndex: number, locale: Locale): string {
  const d = new Date(Date.UTC(2023, 0, 1 + dayIndex));
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "short",
    timeZone: "UTC",
  }).format(d);
}
