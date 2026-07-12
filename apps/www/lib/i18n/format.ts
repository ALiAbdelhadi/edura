import type { Locale } from "./index";

// PRD §9.2: Western numerals are the DEFAULT (Arabic-Indic optional). We force
// the `latn` numbering system in the Arabic locale so numbers read 10,000 not
// ١٠٬٠٠٠ unless `arabicNumerals` is explicitly requested.
function intlLocale(locale: Locale, arabicNumerals = false): string {
  if (locale === "ar") return arabicNumerals ? "ar-EG" : "ar-EG-u-nu-latn";
  return "en-US";
}

/** Money stored as integer piasters → localized EGP with thousands separators. */
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

/** Compact EGP for tight spaces (e.g. 10.5k EGP). */
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
