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

/**
 * A percentage, with the sign the locale actually writes (`٪` in Arabic).
 *
 * `decimals` is opt-in and defaults to 0 — the same shape `formatEGP` already
 * uses — because most percentages here are whole (attendance, a grade band) and
 * rounding them is right. A profit margin is the exception: it is reported to
 * one decimal, and routing it through the 0-decimal default would silently turn
 * 12.4% into 12%. An option, so the caller that needs the precision asks for it
 * and nobody else's figure changes.
 */
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

/* ── Clock times ───────────────────────────────────────────────────────────────
   `schedule_patterns.start_time` / `sessions.start_time` are bare `HH:MM` strings
   meaning CENTER WALL-CLOCK (see PLATFORM_TIME_ZONE) — not instants, so they are
   never `Date`s and `Intl.DateTimeFormat` never saw them. Every screen printed the
   raw column, which put a 24-hour clock in front of the one audience that does not
   read one: the counter staff. Every other time in this product — audit rows, chat
   timestamps, session lists — already renders 12-hour through Intl, so `16:00–18:00`
   on the schedule was also the odd one out.

   The day period is written OUT (`4:00 عصرًا`) rather than abbreviated (`4:00 م`),
   which is the whole point of the change: a receptionist reads a word faster than a
   letter, and مساءً/صباحًا is what they would say out loud.

   CLDR's own `dayPeriod` is deliberately NOT used. It is right for most hours and
   wrong at the edge that matters least often and confuses most: `ar-EG` renders
   00:15 as «في المساء», which names the wrong half of the day. The five buckets
   below are the Egyptian convention, stated once.

   Digits stay LATIN, per the numeral rule at the top of this file — a clock time is
   data, and `4:00 م` is already what the timestamp formatters produce elsewhere.

   THE WHOLE TIME IS ONE LEFT-TO-RIGHT ISLAND, period word included — the same
   treatment `formatDate` already gets under `ar` («1 أغسطس 2026» is an LTR island
   carrying an Arabic month). For a RANGE that is not cosmetic: two separately
   isolated times inside an RTL row lay out right-to-left, so `4:00 – 6:00` renders
   as `6:00 – 4:00` and a lesson appears to end before it starts. That failure was
   already found once here — see the comment in `admin-schedule-screen.tsx`, whose
   fix (one island around the whole range) this keeps.

   THE FACE AND THE PERIOD ARE RETURNED SEPARATELY (`clockParts`) as well as joined,
   and that is not a convenience. A clock time is a figure, so it belongs in <Num> —
   but <Num> is IBM Plex Mono, which ships no Arabic glyphs, so `عصرًا` inside one
   falls silently into another family with no error (the mono trap, third occurrence).
   <Num.Clock> sets the numerals mono and the period word in the body face from these
   parts. The joined strings are for the places that cannot hold an element: a
   `title`, an aria-label, a template literal in a heading. */

const ARABIC_DAY_PERIODS: ReadonlyArray<{ untilHour: number; label: string }> = [
  { untilHour: 5, label: "ليلًا" },
  { untilHour: 12, label: "صباحًا" },
  { untilHour: 13, label: "ظهرًا" },
  { untilHour: 18, label: "عصرًا" },
  { untilHour: 24, label: "مساءً" },
];

/** U+2066 LRI … U+2069 PDI — one left-to-right island inside Arabic text. */
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

/** `16:00` → `{ face: "4:00", period: "عصرًا" }`. `null` when it is not a clock. */
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

/**
 * A `HH:MM` wall-clock string as a 12-hour time with its day period spelled out —
 * `16:00` → `4:00 عصرًا` / `4:00 PM`.
 *
 * Anything that is not a clock string is returned untouched: these values come from
 * the database and from optional schedule patterns, and a screen showing the raw
 * text is a far better failure than one showing `NaN:00`.
 */
export function formatClock(
  value: string | null | undefined,
  locale: Locale,
): string {
  const parts = clockParts(value, locale);
  if (!parts) return value ?? "";
  return isolate(`${parts.face} ${parts.period}`);
}

/**
 * A lesson's `start–end`, with the day period written once when both ends share it
 * (`8:00 – 10:00 مساءً`) and on both when they do not (`10:00 صباحًا – 12:00 ظهرًا`).
 *
 * One island around the pair, so the start is always the left-hand time.
 */
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

/**
 * A clock time that arrives as one already-joined literal — `"16:00"` or
 * `"16:00 – 17:30"`. The guided-tour worlds hold their schedules that way (fixed
 * strings, no start/end pair), and a tour that shows a 24-hour clock while the
 * product it is demonstrating shows a 12-hour one teaches the wrong screen.
 *
 * Anything it cannot read as a clock is returned untouched.
 */
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
  // `formatClock` echoes an unparseable input, so an untouched result means it
  // was never a clock — hand back the caller's own string rather than a rebuild.
  return formatted.includes(start) && !formatted.includes("⁦") ? value : formatted;
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
