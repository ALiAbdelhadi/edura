export type Locale = "ar" | "en";

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
  opts?: { decimals?: number },
): string {
  const decimals = opts?.decimals ?? 0;
  return (
    new Intl.NumberFormat(intlLocale(locale), {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
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

const ARABIC_DAY_PERIODS: ReadonlyArray<{ untilHour: number; label: string }> = [
  { untilHour: 5, label: "ليلًا" },
  { untilHour: 12, label: "صباحًا" },
  { untilHour: 13, label: "ظهرًا" },
  { untilHour: 18, label: "عصرًا" },
  { untilHour: 24, label: "مساءً" },
];

function isolate(run: string): string {
  return `⁦${run}⁩`;
}

function parseClock(value: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function dayPeriod(hour: number, locale: Locale): string {
  if (locale !== "ar") return hour < 12 ? "AM" : "PM";
  return ARABIC_DAY_PERIODS.find((p) => hour < p.untilHour)!.label;
}

function clockFace(hour: number, minute: number): string {
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")}`;
}

export type ClockParts = { face: string; period: string };

export function clockParts(
  value: string | null | undefined,
  locale: Locale,
): ClockParts | null {
  if (!value) return null;
  const parsed = parseClock(value);
  if (!parsed) return null;
  return {
    face: clockFace(parsed.hour, parsed.minute),
    period: dayPeriod(parsed.hour, locale),
  };
}

export function formatClock(
  value: string | null | undefined,
  locale: Locale,
): string {
  const parts = clockParts(value, locale);
  if (!parts) return value ?? "";
  return isolate(`${parts.face} ${parts.period}`);
}

export function formatClockRange(
  start: string | null | undefined,
  end: string | null | undefined,
  locale: Locale,
): string {
  if (!start || !end) return formatClock(start ?? end, locale);
  const a = clockParts(start, locale);
  const b = clockParts(end, locale);
  if (!a || !b) return `${formatClock(start, locale)} – ${formatClock(end, locale)}`;
  const head = a.period === b.period ? a.face : `${a.face} ${a.period}`;
  return isolate(`${head} – ${b.face} ${b.period}`);
}

export function formatClockText(
  value: string | null | undefined,
  locale: Locale,
): string {
  if (!value) return "";
  const [start, end, ...rest] = value.split(/\s*[–—-]\s*/);
  if (rest.length > 0 || !start) return value;
  const formatted = end
    ? formatClockRange(start, end, locale)
    : formatClock(start, locale);
  return formatted.includes(start) && !formatted.includes("⁦") ? value : formatted;
}

export type PluralForms = {
  one: string;
  two?: string;
  few?: string;
  many: string;
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

export function formatProseCount(count: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale, true)).format(count);
}
