"use client";

// Ledger primitives — the shared vocabulary every portal writes figures in.
//
// Promoted here from `features/parent/ledger-kit.tsx` once the shared feature
// folders (attendance, notifications, settings, messaging) needed them: a
// surface rendered by six portals cannot import from one portal's folder. The
// old path still re-exports these, so no call site changed.
//
// The rules they encode, so a reviewer can check them without the spec:
//   · every figure is monospaced and tabular — that is what makes a column of
//     money scan as a column
//   · figures are bidi-isolated, so a Latin numeral inside an Arabic sentence
//     cannot reorder the sentence around it
//   · colour is meaning, never decoration: teal = money confirmed/moved,
//     amber = waiting, red = irreversible/blocking, indigo = brand/action
//   · no gradients, no filled metric variant, no trend-arrow trio
//
// Nothing here is translated. Every user-visible string arrives already
// localized — this package has no i18n and must not acquire one.

import * as React from "react";
import { cn } from "@repo/ui/lib/utils";

/**
 * A number, in the system's second face.
 *
 * `dir="ltr"` + isolation is not cosmetic: Arabic is RTL, digits and Latin
 * glyphs are LTR, and an un-isolated "EGP 1,200" inside an Arabic line can drag
 * neighbouring punctuation to the wrong side. Isolating each figure fixes the
 * whole class of bug once.
 */
export function Figure({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span dir="ltr" className={cn("num inline-block isolate", className)}>
      {children}
    </span>
  );
}

/**
 * A money amount.
 *
 * `tone` is deliberately narrow. A refund is NOT amber: amber means *waiting*,
 * and a refund has already happened. It renders as plain ink with an explicit
 * minus, so the sign carries the meaning instead of a colour that would claim
 * the wrong state. `due` IS amber — an outstanding balance is waiting. Neither
 * is ever red: red means irreversible or blocking, not unpaid.
 */
export function Money({
  amount,
  format,
  tone = "auto",
  className,
}: {
  amount: number;
  format: (v: number) => string;
  tone?: "auto" | "plain" | "paid" | "due";
  className?: string;
}) {
  const negative = amount < 0;
  const resolved = tone === "auto" ? (negative ? "plain" : "paid") : tone;
  const TONE = {
    paid: "text-teal",
    due: "text-amber",
    plain: "text-ink",
  } as const;
  return (
    <Figure className={cn("font-medium", TONE[resolved], className)}>
      {negative ? "−" : ""}
      {format(Math.abs(amount))}
    </Figure>
  );
}

/**
 * A metric.
 *
 * Three rows, and the third is the one that matters: it states *why this number
 * matters* — what it is out of, what period it covers, what it is waiting on.
 * It is never a percentage delta with no referent, which is the thing the audit
 * called out. If there is nothing true to say in row 3, leave it out.
 */
export function Metric({
  label,
  value,
  reason,
  tone = "neutral",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  reason?: React.ReactNode;
  tone?: "neutral" | "blocking";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-xl border bg-sheet p-4",
        tone === "blocking" ? "border-red" : "border-rule",
        className,
      )}
      style={{ boxShadow: "var(--lift)" }}
    >
      <span className="eyebrow">{label}</span>
      <span className="text-[27px] leading-none font-semibold text-ink">
        {value}
      </span>
      {reason ? <span className="text-xs text-ink-2">{reason}</span> : null}
    </div>
  );
}

/** Section label. Mono eyebrow above a plain title, separated by a hairline. */
export function SectionHead({
  eyebrow,
  title,
  action,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-end justify-between gap-3 border-b border-rule pb-2",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      </div>
      {action}
    </div>
  );
}

/** The accountant's close: a double rule above the final figure. */
export function TotalLine({
  label,
  value,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rule-total mt-1 flex items-baseline justify-between gap-4 pt-2",
        className,
      )}
    >
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      <span className="text-[15px] font-semibold text-ink">{value}</span>
    </div>
  );
}

/**
 * A plain statement of a limit.
 *
 * Where a user cannot act, there is nothing to click and a line saying who can.
 * That line is this component. It is prose on paper, not a disabled control and
 * not a warning — not amber, because nothing is waiting, and not red, because
 * nothing is wrong.
 */
export function LimitNote({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-xs leading-relaxed text-ink-2", className)}>
      {children}
    </p>
  );
}

/**
 * An error that is NOT an empty state.
 *
 * "There is nothing" and "we could not find out" are different facts, and
 * collapsing them is the most damaging bug a read-only surface can have.
 * Always offers the retry.
 */
export function LoadError({
  message,
  onRetry,
  retryLabel,
  className,
}: {
  message: React.ReactNode;
  onRetry: () => void;
  retryLabel: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-2 rounded-xl border border-red bg-red-soft p-4",
        className,
      )}
    >
      <p className="text-[13px] font-medium text-red">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs font-semibold text-ink underline underline-offset-4 hover:no-underline"
      >
        {retryLabel}
      </button>
    </div>
  );
}

/** Skeleton rows. A spinner-in-a-box tells you nothing about what is coming. */
export function SkeletonRows({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-rule-2" />
      ))}
    </div>
  );
}
