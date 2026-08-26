"use client";

import type { Locale } from "@repo/ui/lib/format";
import { clockParts } from "@repo/ui/lib/format";
import { cn } from "@repo/ui/lib/utils";
import * as React from "react";

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
          currencyClassName ?? "ms-1 text-[0.62em] font-medium text-(--ink-2)"
        }
      >
        {currency}
      </span>
    </span>
  );
}

type MoneyTone = "neutral" | "in" | "out" | "net";

export function Money({
  children,
  tone = "neutral",
  className,
  ...rest
}: React.ComponentProps<"span"> & { tone?: MoneyTone }) {
  const toneClass: Record<MoneyTone, string> = {
    neutral: "text-[var(--ink-2)]",
    in: "text-[var(--teal)]",
    out: "text-destructive",
    net: "text-[var(--ink)] font-semibold",
  };
  return (
    <Num className={cn(toneClass[tone], className)} {...rest}>
      {children}
    </Num>
  );
}
