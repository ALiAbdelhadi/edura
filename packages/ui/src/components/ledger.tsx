"use client";

import * as React from "react";
import { cn } from "@repo/ui/lib/utils";

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
