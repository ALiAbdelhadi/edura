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

const ALIGN: Record<Align, string> = {
  start: "text-start",
  end: "text-end",
};

export type NumProps = React.ComponentProps<"span"> & {
  align?: Align;
  isolate?: boolean;
};

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

export type NumMoneyProps = Omit<NumProps, "children"> & {
  piasters: number | null | undefined;
  locale: Locale;
  tone?: MoneyTone;
  sign?: boolean;
  decimals?: boolean;
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

export type NumFigureProps = Omit<NumProps, "children"> & {
  value: number | null | undefined;
  locale: Locale;
};

function NumFigure({ value, locale, ...props }: NumFigureProps) {
  return <NumRoot {...props}>{formatNumber(value, locale)}</NumRoot>;
}

export type NumDateProps = Omit<NumProps, "children"> & {
  value: string | Date | null | undefined;
  locale: Locale;
  options?: Intl.DateTimeFormatOptions;
};

function NumDate({ value, locale, options, ...props }: NumDateProps) {
  return <NumRoot {...props}>{formatDate(value, locale, options)}</NumRoot>;
}

export type NumCodeProps = NumProps;

function NumCode({ className, ...props }: NumCodeProps) {
  return <NumRoot className={cn("text-ink-3", className)} {...props} />;
}

function NumTotal({ className, ...props }: NumMoneyProps) {
  return (
    <NumMoney
      className={cn("rule-total pt-2 text-[17px] font-semibold", className)}
      {...props}
    />
  );
}

export type NumClockProps = Omit<NumProps, "children"> & {
  value: string | null | undefined;
  locale: Locale;
};

function Period({ children }: { children: string }) {
  return <span className="font-sans">{children}</span>;
}

const CLOCK_WRAP = "ltr-island inline-flex items-baseline gap-1 whitespace-nowrap";

function NumClock({ value, locale, className, ...props }: NumClockProps) {
  const parts = clockParts(value, locale);
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

export type ProseCountProps = React.ComponentProps<"span"> & {
  count: number;
  locale: Locale;
  forms?: PluralForms;
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
