"use client";

import { Link } from "@/i18n/navigation";
import { cn } from "@repo/ui/lib/utils";
import * as React from "react";
import { Num } from "./num";

type Tone = "indigo" | "teal" | "amber" | "red";

const LABEL_TONE: Record<Tone, string> = {
  indigo: "text-[var(--indigo)]",
  teal: "text-[var(--teal)]",
  amber: "text-[var(--amber)]",
  red: "text-destructive",
};

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
  meta?: React.ReactNode;
  count: React.ReactNode;
  amount?: React.ReactNode;
  fact?: React.ReactNode;
  factIcon?: React.ReactNode;
  blocking?: boolean;
  blockingLabel?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "lg-card flex flex-col gap-3.5 p-4.5 transition-colors",
        "hover:bg-(--rule-2)",
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
          <span className="rounded-[5px] bg-(--red-soft) px-1.5 py-px text-[11px] font-semibold text-destructive">
            {blockingLabel}
          </span>
        ) : meta ? (
          <Num className="text-[11px] text-(--ink-3)">{meta}</Num>
        ) : null}
      </div>
      <div className="flex items-baseline gap-2.5">
        <Num
          className={cn(
            "text-[34px] font-semibold leading-none",
            blocking ? "text-destructive" : "text-(--ink)",
          )}
        >
          {count}
        </Num>
        {amount ? (
          <Num
            className={cn(
              "text-sm font-semibold",
              blocking ? "text-destructive" : "text-(--money)",
            )}
          >
            {amount}
          </Num>
        ) : null}
      </div>
      {fact ? (
        <span className="flex items-center gap-1.5 text-xs leading-relaxed text-(--ink-2)">
          {factIcon}
          {fact}
        </span>
      ) : null}
    </Link>
  );
}
