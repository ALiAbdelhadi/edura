/* <Num> — every figure in the product.
   ══════════════════════════════════════════════════════════════════════════════

   This is not a formatting helper. It is the device that distinguishes WHAT THE
   SYSTEM COMPUTED from WHAT A HUMAN WROTE.

   A figure set in the proportional body face reads as prose, and prose invites doubt
   about whether a number is authoritative. In a system whose ledger is append-only —
   `transactions` and `points_ledger` carry REVOKE UPDATE/DELETE — the user cannot
   correct a figure after the fact, so they must be able to trust it beforehand. Mono
   + tabular is how the interface says "this came from the database, not from a
   person". It is also what makes Latin-inside-Arabic systematic rather than
   incidental, which is why it earns its place in an Arabic-first product
   specifically.

   ── The two paths (they are NOT one component with a flag) ────────────────────

   <Num>          data.   Latin digits, IBM Plex Mono, tabular, direction-isolated.
                          Money, IDs, dates, codes, table figures, counts of 3+.
   <ProseCount>   prose.  Arabic-Indic digits, the body Arabic face, no mono, no
                          tabular, inline in the sentence, correct dual/plural.

   They are separate exports because they mean different things, and because the
   failure mode of merging them is silent: IBM Plex Mono ships no Arabic-Indic
   glyphs, so `font-mono` on `٣` falls back to another family with no error and
   `tabular-nums` stops applying. A boolean prop would let a caller reach that state
   by accident. Two components cannot.

   ── Direction isolation ──────────────────────────────────────────────────────

   Every <Num> isolates its own content. `·`, `-`, `—`, `:` and `()` are bidi-NEUTRAL
   characters: between an LTR run and an RTL run, their placement is resolved by the
   paragraph direction rather than by what the author intended, so
   `TRX-98421 · مدرّس فيزياء` does not render the way it was written inside an RTL
   page — the separator migrates to the wrong side of the code. Isolating each run
   fixes it structurally, at the component, once.

   NEVER fix a bidi break by reordering the source string. The next translation
   reintroduces it. */

import * as React from "react";

import { cn } from "@repo/ui/lib/utils";
import {
  clockParts,
  formatDate,
  formatEGP,
  formatNumber,
  formatProseCount,
  formatShortEGP,
  pluralForm,
  type Locale,
  type PluralForms,
} from "@repo/ui/lib/format";

/* ── Money tone ────────────────────────────────────────────────────────────────
   Colour is meaning, never decoration:
     out      money actually leaving the platform      −  --red
     in       platform income                          +  --teal
     net      the decisive figure the user acts on        --ink, 600
     muted    an intermediate line in a computation       --ink-2
     plain    a figure with no financial direction        inherits

   `out` and `in` carry an explicit leading sign because a payout and a receipt of the
   same magnitude must never look alike. */
export type MoneyTone = "out" | "in" | "net" | "muted" | "plain";

const MONEY_TONE: Record<MoneyTone, string> = {
  out: "text-red",
  in: "text-teal",
  net: "font-semibold text-ink",
  muted: "text-ink-2",
  plain: "",
};

const BASE = "num";

type Align = "start" | "end";

/* Numeric columns are END-aligned; text columns start-aligned. Always.
   In RTL, `end` is the LEFT edge — so every amount in the Arabic product aligns left
   while its Arabic label aligns right. That is deliberate and it is held in both
   directions: a column of figures is only scannable when the digits line up on the
   side the magnitude grows toward, and that side does not change with the script. */
const ALIGN: Record<Align, string> = {
  start: "text-start",
  end: "text-end",
};

export type NumProps = React.ComponentProps<"span"> & {
  align?: Align;
  /** Isolation is on by default and should essentially never be turned off. */
  isolate?: boolean;
};

/** The base figure. Latin mono, tabular, direction-isolated. */
function NumRoot({
  className,
  align,
  isolate = true,
  ...props
}: NumProps) {
  return (
    <span
      className={cn(
        BASE,
        isolate && "ltr-island inline-block",
        align && ALIGN[align],
        className,
      )}
      {...props}
    />
  );
}

/* ── Money ─────────────────────────────────────────────────────────────────────
   Amounts are integer PIASTERS throughout this system. `decimals` defaults to true
   because a money figure that hides its piasters is a figure the user cannot
   reconcile against a receipt.

   There is deliberately no editable variant. Amounts are append-only; rendering one
   as an input would be the interface lying about what the database permits. */
export type NumMoneyProps = Omit<NumProps, "children"> & {
  /** Integer piasters. */
  piasters: number | null | undefined;
  locale: Locale;
  tone?: MoneyTone;
  /** Show the `+` / `−` for `in` / `out`. On by default — that is the point of them. */
  sign?: boolean;
  decimals?: boolean;
  /** `1.2k ج.م` — for chart axes and dense meta only, never for a figure being authorised. */
  short?: boolean;
};

function NumMoney({
  piasters,
  locale,
  tone = "plain",
  sign = true,
  decimals = true,
  short = false,
  className,
  align = "end",
  ...props
}: NumMoneyProps) {
  const magnitude = Math.abs(piasters ?? 0);
  const body = short
    ? formatShortEGP(magnitude, locale)
    : formatEGP(magnitude, locale, { decimals });

  // U+2212 MINUS SIGN, not a hyphen: a hyphen is bidi-neutral and reads as a dash.
  // Zero carries NO direction — "−0.00" reads as a debit that never happened,
  // and "+0.00" would be just as untrue — so the sign is suppressed at zero.
  const prefix =
    !sign || magnitude === 0 ? "" : tone === "out" ? "−" : tone === "in" ? "+" : "";

  return (
    <NumRoot
      className={cn(MONEY_TONE[tone], className)}
      align={align}
      {...props}
    >
      {prefix}
      {body}
    </NumRoot>
  );
}

/* ── Plain figure ──────────────────────────────────────────────────────────────
   Counts of three or more, session totals, quantities. Latin digits even under `ar` —
   this is data, not prose. */
export type NumFigureProps = Omit<NumProps, "children"> & {
  value: number | null | undefined;
  locale: Locale;
};

function NumFigure({ value, locale, ...props }: NumFigureProps) {
  return <NumRoot {...props}>{formatNumber(value, locale)}</NumRoot>;
}

/* ── Date ──────────────────────────────────────────────────────────────────────
   Dates are data. They render mono, Latin-digit, inside their own isolate — which is
   what stops `01 — 15 JUL 2026` from reordering around the bidi-neutral em dash in an
   RTL page. */
export type NumDateProps = Omit<NumProps, "children"> & {
  value: string | Date | null | undefined;
  locale: Locale;
  options?: Intl.DateTimeFormatOptions;
};

function NumDate({ value, locale, options, ...props }: NumDateProps) {
  return <NumRoot {...props}>{formatDate(value, locale, options)}</NumRoot>;
}

/* ── Code ──────────────────────────────────────────────────────────────────────
   `TRX-98421`, `PAY-2026-0431`, `**** 4432`, `ovsdemo-3@edura.test`. Always Latin,
   always isolated — this is the single most common source of a bidi break in the
   product, because a code is nearly always adjacent to an Arabic phrase. */
export type NumCodeProps = NumProps;

function NumCode({ className, ...props }: NumCodeProps) {
  return <NumRoot className={cn("text-ink-3", className)} {...props} />;
}

/* ── Total ─────────────────────────────────────────────────────────────────────
   The accountant's double rule says: this line is a CONCLUSION, not another row. It
   belongs anywhere a number is a sum the user is expected to act on — and nowhere
   else. Because the ledger is append-only, a total the user cannot derive is a total
   they must trust blindly, so every intermediate figure above it must be shown. */
function NumTotal({ className, ...props }: NumMoneyProps) {
  return (
    <NumMoney
      className={cn("rule-total pt-2 text-[17px] font-semibold", className)}
      {...props}
    />
  );
}

/* ── Clock ─────────────────────────────────────────────────────────────────────
   A lesson time — `4:00 عصرًا`, `4:00 عصرًا – 6:00 مساءً`.

   THE FAMILY SWITCHES MID-FIGURE, and that is the whole reason this is a component
   rather than a string in a <Num>. The numerals are data and set mono; `عصرًا` is a
   WORD, and IBM Plex Mono ships no Arabic glyphs, so a period word inside the mono
   island falls into another family silently. Same resolution as everywhere else this
   trap appears: geometry shared, family switched.

   The period is written once when both ends of a range share it, and on both when
   they do not — `8:00 – 10:00 مساءً` but `10:00 صباحًا – 12:00 ظهرًا`. The whole thing
   is `whitespace-nowrap`: a lesson time broken across two lines is two times.

   ONE `ltr-island` around the WHOLE range, never one per time — this is a flex row,
   and in an RTL page a row of two separately isolated times lays out right-to-left,
   so `4:00 – 6:00` renders as `6:00 – 4:00`: a lesson that appears to end before it
   starts. The inner figures therefore set `isolate={false}`; the wrapper is the
   island. Same fix, same reason, as `formatClockRange`. */
export type NumClockProps = Omit<NumProps, "children"> & {
  /** A bare `HH:MM` wall-clock string. */
  value: string | null | undefined;
  locale: Locale;
};

function Period({ children }: { children: string }) {
  return <span className="font-sans">{children}</span>;
}

const CLOCK_WRAP = "ltr-island inline-flex items-baseline gap-1 whitespace-nowrap";

function NumClock({ value, locale, className, ...props }: NumClockProps) {
  const parts = clockParts(value, locale);
  // Not a clock string — show whatever the row actually holds rather than nothing.
  if (!parts) return <NumRoot className={className} {...props}>{value ?? ""}</NumRoot>;
  return (
    <span className={cn(CLOCK_WRAP, className)}>
      <NumRoot isolate={false} {...props}>
        {parts.face}
      </NumRoot>
      <Period>{parts.period}</Period>
    </span>
  );
}

export type NumClockRangeProps = Omit<NumProps, "children"> & {
  start: string | null | undefined;
  end: string | null | undefined;
  locale: Locale;
};

function NumClockRange({
  start,
  end,
  locale,
  className,
  ...props
}: NumClockRangeProps) {
  const a = clockParts(start, locale);
  const b = clockParts(end, locale);
  if (!a || !b) {
    return <NumClock value={a ? start : end} locale={locale} className={className} {...props} />;
  }
  return (
    <span className={cn(CLOCK_WRAP, className)}>
      <NumRoot isolate={false} {...props}>
        {a.face}
      </NumRoot>
      {a.period === b.period ? null : <Period>{a.period}</Period>}
      <span aria-hidden>–</span>
      <NumRoot isolate={false} {...props}>
        {b.face}
      </NumRoot>
      <Period>{b.period}</Period>
    </span>
  );
}


/** A joined literal — `"16:00 – 17:30"` — as the guided-tour worlds hold them. */
function splitClockText(value: string | null | undefined) {
  const [start, end, ...rest] = (value ?? "").split(/\s*[–—-]\s*/);
  return rest.length > 0 ? { start: value, end: undefined } : { start, end };
}

export type NumClockTextProps = Omit<NumProps, "children"> & {
  value: string | null | undefined;
  locale: Locale;
};

function NumClockText({ value, ...props }: NumClockTextProps) {
  const { start, end } = splitClockText(value);
  return end ? (
    <NumClockRange start={start} end={end} {...props} />
  ) : (
    <NumClock value={start} {...props} />
  );
}

export const Num = Object.assign(NumRoot, {
  Money: NumMoney,
  Figure: NumFigure,
  Date: NumDate,
  Code: NumCode,
  Total: NumTotal,
  Clock: NumClock,
  ClockRange: NumClockRange,
  ClockText: NumClockText,
});

/* ══════════════════════════════════════════════════════════════════════════════
   <ProseCount> — the OTHER path. A word in a sentence, not a value.
   ══════════════════════════════════════════════════════════════════════════════

   `٣ أيام`, `يومان`. Arabic-Indic digits in the body Arabic face, no mono, no tabular,
   flowing inline with the sentence around it.

   Arabic marks three grammatical numbers — singular, DUAL, plural — and the plural
   switches form again above ten. `٢ أيام` is wrong where `يومان` is right, and that
   error appears in exactly the strings users read most ("3 days ago", "2 sessions
   left"). The caller supplies the forms; this picks.

   Use for small inline counts inside prose ONLY. Anything in a table, a total, a
   badge, or a figure the user acts on is <Num>. */
export type ProseCountProps = React.ComponentProps<"span"> & {
  count: number;
  locale: Locale;
  /** Omit for a bare numeral; supply to get agreement (`٣ أيام` / `يومان`). */
  forms?: PluralForms;
  /** `false` renders the numeral only — the noun is elsewhere in the sentence. */
  showCount?: boolean;
};

export function ProseCount({
  count,
  locale,
  forms,
  showCount = true,
  className,
  ...props
}: ProseCountProps) {
  const noun = forms ? pluralForm(count, locale, forms) : "";
  // The Arabic dual is a form of the NOUN, not a separate numeral — `يومان` already
  // means "two days", so printing "٢" beside it is a duplication a native reader sees
  // immediately. Same for the singular.
  const suppress =
    locale === "ar" && forms != null && (Math.abs(count) === 1 || Math.abs(count) === 2);
  const numeral =
    showCount && !suppress ? formatProseCount(count, locale) : "";

  return (
    <span className={cn("num-prose", className)} {...props}>
      {[numeral, noun].filter(Boolean).join(" ")}
    </span>
  );
}
