"use client";

import { cn } from "@repo/ui/lib/utils";
import { Link } from "@/i18n/navigation";
import * as React from "react";
import { Num } from "./num";

type Tone = "indigo" | "teal" | "amber" | "red";

const LABEL_TONE: Record<Tone, string> = {
  indigo: "text-[var(--indigo)]",
  teal: "text-[var(--teal)]",
  amber: "text-[var(--amber)]",
  red: "text-[var(--red)]",
};

/**
 * MetricCard — three rows, and row 3 is the point.
 *
 * No gradient, no filled variant, no trend-arrow trio. Row 3 is *the reason this
 * number matters* ("أقدم طلب: ٣ أيام"), never a percentage delta with no
 * referent — a delta the operator cannot act on is decoration.
 *
 * Cards are links. Each one is the door to its queue; a metric the operator
 * cannot walk into is a dead end, which is the defect the old seven-identical-
 * StatCards Overview had.
 */
export function MetricCard({
  href,
  label,
  icon,
  tone = "indigo",
  meta,
  count,
  amount,
  fact,
  factIcon,
  blocking = false,
  blockingLabel,
}: {
  href: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  /** mono right-hand meta, e.g. an SLA */
  meta?: React.ReactNode;
  count: React.ReactNode;
  /** optional money figure, baseline-aligned with the count */
  amount?: React.ReactNode;
  /** row 3 — why this number matters */
  fact?: React.ReactNode;
  factIcon?: React.ReactNode;
  blocking?: boolean;
  blockingLabel?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "lg-card flex flex-col gap-3.5 p-[18px] transition-colors",
        "hover:bg-[var(--rule-2)]",
      )}
      data-blocking={blocking || undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "flex items-center gap-1.5 text-[13px] font-semibold",
            LABEL_TONE[blocking ? "red" : tone],
          )}
        >
          {icon}
          {label}
        </span>
        {blocking && blockingLabel ? (
          <span className="rounded-[5px] bg-[var(--red-soft)] px-1.5 py-px text-[11px] font-semibold text-[var(--red)]">
            {blockingLabel}
          </span>
        ) : meta ? (
          <Num className="text-[11px] text-[var(--ink-3)]">{meta}</Num>
        ) : null}
      </div>

      <div className="flex items-baseline gap-2.5">
        <Num
          className={cn(
            "text-[34px] font-semibold leading-none",
            blocking ? "text-[var(--red)]" : "text-[var(--ink)]",
          )}
        >
          {count}
        </Num>
        {amount ? (
          <Num
            className={cn(
              "text-sm font-semibold",
              blocking ? "text-[var(--red)]" : "text-[var(--money)]",
            )}
          >
            {amount}
          </Num>
        ) : null}
      </div>

      {fact ? (
        <span className="flex items-center gap-1.5 text-xs leading-relaxed text-[var(--ink-2)]">
          {factIcon}
          {fact}
        </span>
      ) : null}
    </Link>
  );
}
