"use client";

import { clockParts } from "@repo/ui/lib/format";
import type { Locale } from "@repo/ui/lib/format";
import { cn } from "@repo/ui/lib/utils";
import * as React from "react";

/**
 * <Num> — every figure in the system passes through here.
 *
 * Two paths, deliberately NOT merged behind a flag:
 *
 *   <Num>            data. Mono, tabular, Latin digits, `dir="ltr"` so a minus
 *                    sign, a decimal point or a Latin code never reorders inside
 *                    an Arabic sentence. Money, IDs, dates, counts of 3+.
 *
 *   <ProseCount>     a count living inside Arabic prose where grammatical
 *                    agreement matters (`٣ أيام`, `يومان`). NOT mono, NOT ltr —
 *                    it is a word, and forcing it into the data path is what
 *                    produces "2 أيام" instead of "يومان".
 *
 * Merging them behind a boolean is unsafe: the wrong default silently produces
 * ungrammatical Arabic in one direction and mis-ordered figures in the other.
 */
function NumBase({
  children,
  className,
  ...rest
}: React.ComponentProps<"span">) {
  return (
    <span dir="ltr" className={cn("num", className)} {...rest}>
      {children}
    </span>
  );
}

/* ── Clock ─────────────────────────────────────────────────────────────────
   A lesson time — `4:00 عصرًا`, `4:00 عصرًا – 6:00 مساءً`. The numerals are data
   and stay mono; the day period is a WORD and must NOT be, because the mono face
   ships no Arabic glyphs and would drop it into a fallback family with no error.

   ONE `dir="ltr"` wrapper around the WHOLE range, never one per time: two
   separately isolated times inside an RTL row lay out right-to-left, so
   `4:00 – 6:00` renders as `6:00 – 4:00`.

   Only the MARKUP is local. What the time says — the 12-hour face and which day
   period an hour falls in — comes from `clockParts` in @repo/ui, the one place
   it is decided. */
const CLOCK_WRAP = "inline-flex items-baseline gap-1 whitespace-nowrap";

function Period({ children }: { children: string }) {
  return <span className="font-sans">{children}</span>;
}

function Clock({
  value,
  locale,
  className,
  ...rest
}: { value: string | null | undefined; locale: Locale } & Omit<
  React.ComponentProps<"span">,
  "children"
>) {
  const parts = clockParts(value, locale);
  if (!parts) return <NumBase className={className} {...rest}>{value ?? ""}</NumBase>;
  return (
    <span dir="ltr" className={cn(CLOCK_WRAP, className)}>
      <span className={cn("num")} {...rest}>
        {parts.face}
      </span>
      <Period>{parts.period}</Period>
    </span>
  );
}

function ClockRange({
  start,
  end,
  locale,
  className,
  ...rest
}: {
  start: string | null | undefined;
  end: string | null | undefined;
  locale: Locale;
} & Omit<React.ComponentProps<"span">, "children">) {
  const a = clockParts(start, locale);
  const b = clockParts(end, locale);
  if (!a || !b) {
    return <Clock value={a ? start : end} locale={locale} className={className} {...rest} />;
  }
  return (
    <span dir="ltr" className={cn(CLOCK_WRAP, className)}>
      <span className="num" {...rest}>
        {a.face}
      </span>
      {a.period === b.period ? null : <Period>{a.period}</Period>}
      <span aria-hidden>–</span>
      <span className="num" {...rest}>
        {b.face}
      </span>
      <Period>{b.period}</Period>
    </span>
  );
}


/** A joined literal — `"16:00 – 17:30"` — as the guided-tour worlds hold them. */
function splitClockText(value: string | null | undefined) {
  const [start, end, ...rest] = (value ?? "").split(/\s*[–—-]\s*/);
  return rest.length > 0 ? { start: value, end: undefined } : { start, end };
}

function ClockText({
  value,
  ...props
}: { value: string | null | undefined; locale: Locale } & Omit<
  React.ComponentProps<"span">,
  "children"
>) {
  const { start, end } = splitClockText(value);
  return end ? (
    <ClockRange start={start} end={end} {...props} />
  ) : (
    <Clock value={start} {...props} />
  );
}

export const Num = Object.assign(NumBase, { Clock, ClockRange, ClockText });

/**
 * A DATE that carries a month NAME — "٢٠ أغسطس ٢٠٢٦", "Aug 20, 2026".
 *
 * ── WHY A DATE IS NOT A FIGURE ────────────────────────────────────────────
 *
 * `<Num>` isolates its content `dir="ltr"` so a minus sign or a decimal point
 * cannot reorder inside an Arabic sentence, and sets it in the mono face. Both
 * are right for money, ids and counts. Neither is right for a date, because
 * `formatDate` resolves an Arabic month to a WORD:
 *
 *   · isolated LTR, "٢٠ أغسطس ٢٠٢٦" lays the day out AFTER the month —
 *     "أغسطس ٢٠٢٦ ٢٠" — which is not how anyone writes a date; and
 *   · the mono face ships no Arabic glyphs, so the month silently drops into
 *     a fallback family, which is the same trap `Clock` lifts its day period
 *     out of the isolate to avoid.
 *
 * The string is one opaque localized value, so its numerals cannot be split
 * from its word the way a clock's can. So a date goes in the body face, in the
 * ambient direction, and lets the bidi algorithm do what CLDR already ordered.
 *
 * A date formatted with NUMERIC fields only (`2026-08-20`, `20/08/2026`) has no
 * word in it and may stay in `<Num>`.
 */
export function DateText({
  children,
  className,
  ...rest
}: React.ComponentProps<"span">) {
  return (
    <span className={className} {...rest}>
      {children}
    </span>
  );
}

/**
 * A count inside Arabic prose. Stays in the body face and the ambient direction
 * so the surrounding sentence keeps its agreement.
 */
export function ProseCount({
  children,
  className,
  ...rest
}: React.ComponentProps<"span">) {
  return (
    <span className={className} {...rest}>
      {children}
    </span>
  );
}

/**
 * <Amount> — a money figure, split.
 *
 * `formatEGP` returns ONE string: "1,234 ج.م". Setting that whole string in mono
 * breaks, because IBM Plex Mono carries no Arabic glyphs — «ج.م» falls back to
 * another face and loses the baseline. And wrapping it in dir="ltr" to protect
 * the digits then drags the currency word along with it.
 *
 * So the numeral and the currency are rendered separately: Latin mono digits for
 * the data (the numerals rule), the currency word in the Arabic body face,
 * smaller and muted. This is the anatomy the hi-fi reference uses for its
 * decisive figures, and it is what <Num> alone cannot express.
 */
export function Amount({
  piasters,
  locale,
  decimals = true,
  className,
  currencyClassName,
}: {
  piasters: number | null | undefined;
  locale: string;
  decimals?: boolean;
  className?: string;
  currencyClassName?: string;
}) {
  const egp = (piasters ?? 0) / 100;
  // Latin digits always — "Latin mono digits for all data" — regardless of the
  // Arabic locale, which would otherwise give Arabic-Indic numerals here.
  const numeral = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(egp);
  const currency = locale === "ar" ? "ج.م" : "EGP";

  return (
    <span className={className}>
      <Num>{numeral}</Num>
      <span
        className={
          currencyClassName ?? "ms-1 text-[0.62em] font-medium text-[var(--ink-2)]"
        }
      >
        {currency}
      </span>
    </span>
  );
}

type MoneyTone = "neutral" | "in" | "out" | "net";

/**
 * Money cell. Mono, end-aligned by the table, never an editable-looking input —
 * amounts are append-only integer piasters and the UI must not imply otherwise.
 *
 *   in      platform income, leading +, teal
 *   out     value leaving, leading −, red
 *   net     the decisive figure the operator is authorizing — full ink, 600
 *   neutral intermediate subtotals, muted
 */
export function Money({
  children,
  tone = "neutral",
  className,
  ...rest
}: React.ComponentProps<"span"> & { tone?: MoneyTone }) {
  const toneClass: Record<MoneyTone, string> = {
    neutral: "text-[var(--ink-2)]",
    in: "text-[var(--teal)]",
    out: "text-[var(--red)]",
    net: "text-[var(--ink)] font-semibold",
  };
  return (
    <Num className={cn(toneClass[tone], className)} {...rest}>
      {children}
    </Num>
  );
}
