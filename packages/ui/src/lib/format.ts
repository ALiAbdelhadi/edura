/* Locale-aware formatters — the single source of truth for both apps.
   Promoted here from `apps/{www,superadmin}/src/lib/i18n/format.ts`, which were
   byte-identical forks with 65 consumer files between them. Both app modules now
   re-export this one, so no call site changed.

   It lives in @repo/ui rather than @repo/server-core because <Num> depends on it and
   <Num> is a UI primitive: the component that renders a figure and the function that
   formats it must not be able to drift apart.

   ── The numeral rule, which is the reason `arabicNumerals` exists ─────────────
   Arabic-Indic (`٣ حصص`) for small inline counts inside Arabic prose, where
   grammatical agreement matters. Latin for ALL data — money, IDs, dates, codes, table
   figures, counts of three or more. `ar-EG-u-nu-latn` is what forces Latin digits
   under an Arabic locale; plain `ar-EG` gives Arabic-Indic.

   The two are not interchangeable and must not be selected by a caller's taste: one
   is a value the system computed, the other is a word in a sentence. See <Num> and
   <ProseCount>, which encode that as two separate components. */

export type Locale = "ar" | "en";

function intlLocale(locale: Locale, arabicNumerals = false): string {
  if (locale === "ar") return arabicNumerals ? "ar-EG" : "ar-EG-u-nu-latn";
  return "en-US";
}

/** Money is integer PIASTERS everywhere in this system — never a float. */
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

export function formatShortEGP(
  piasters: number | null | undefined,
  locale: Locale,
): string {
  const egp = Math.round((piasters ?? 0) / 100);
  const suffix = locale === "ar" ? "ج.م" : "EGP";
  if (Math.abs(egp) >= 1000) {
    const nf = new Intl.NumberFormat(intlLocale(locale), {
      maximumFractionDigits: 1,
    });
    return `${nf.format(egp / 1000)}k ${suffix}`;
  }
  return `${new Intl.NumberFormat(intlLocale(locale)).format(egp)} ${suffix}`;
}

export function formatNumber(
  value: number | null | undefined,
  locale: Locale,
): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value ?? 0);
}

export function formatPercent(
  value: number | null | undefined,
  locale: Locale,
): string {
  return (
    new Intl.NumberFormat(intlLocale(locale), {
      maximumFractionDigits: 0,
    }).format(value ?? 0) + (locale === "ar" ? "٪" : "%")
  );
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
    resolveDateOptions(locale, opts ?? { year: "numeric", month: "short", day: "numeric" }),
  ).format(d);
}

/**
 * `dateStyle: "medium"` means a NAMED month — "Aug 1, 2026" in English. Arabic
 * CLDR resolves the same request to slash-separated numerals carrying U+200F
 * marks ("01‏/08‏/2026"), which reorder into things like "012026/08/" when they
 * sit beside Arabic text. Callers asking for `medium` want the readable form,
 * so Arabic gets the named month it was asking for. Every other request — and
 * every explicit field set — is passed through untouched.
 */
function resolveDateOptions(
  locale: Locale,
  opts: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatOptions {
  if (locale !== "ar" || opts.dateStyle !== "medium" || opts.timeStyle) return opts;
  const { dateStyle: _dropped, ...rest } = opts;
  return { ...rest, day: "numeric", month: "long", year: "numeric" };
}

export function formatWeekdayShort(dayIndex: number, locale: Locale): string {
  const d = new Date(Date.UTC(2023, 0, 1 + dayIndex));
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "short",
    timeZone: "UTC",
  }).format(d);
}

/* ── Prose counts ──────────────────────────────────────────────────────────────
   Arabic marks THREE grammatical numbers, not two: singular, DUAL, and plural — and
   the plural form itself switches above ten. `٢ أيام` is wrong; the dual is `يومان`.
   Getting this wrong is the most visible possible tell that a product was translated
   rather than written in Arabic, and it appears in exactly the places users read most
   often ("3 days ago", "2 sessions left").

   Callers supply the four forms; this picks. English collapses to two, which is why
   the same signature serves both. */
export type PluralForms = {
  /** 1 — يوم */
  one: string;
  /** 2 — يومان (Arabic dual). Falls back to `many` when a language has no dual. */
  two?: string;
  /** 3–10 — أيام */
  few?: string;
  /** 11+ / default — يوماً */
  many: string;
  /** 0 — optional; falls back to `many`. */
  zero?: string;
};

export function pluralForm(
  count: number,
  locale: Locale,
  forms: PluralForms,
): string {
  const n = Math.abs(count);
  if (n === 0 && forms.zero) return forms.zero;
  if (locale !== "ar") return n === 1 ? forms.one : forms.many;
  if (n === 1) return forms.one;
  if (n === 2) return forms.two ?? forms.many;
  if (n >= 3 && n <= 10) return forms.few ?? forms.many;
  return forms.many;
}

/** Arabic-Indic digits for prose. Latin under `en`. */
export function formatProseCount(count: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale, true)).format(count);
}
