"use client";

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
export function Num({
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
