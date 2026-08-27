import { Card, CardContent } from "@repo/ui/components/card";
import { cn } from "@repo/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

export function MetricCard({
  label,
  value,
  secondary,
  fact,
  factIcon: FactIcon,
  meta,
  icon: Icon,
  tone = "neutral",
  blocking,
  href,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  secondary?: React.ReactNode;
  fact?: React.ReactNode;
  factIcon?: LucideIcon;
  meta?: React.ReactNode;
  icon?: LucideIcon;
  tone?: "neutral" | "pending" | "paid" | "attention";
  blocking?: React.ReactNode;
  href?: string;
  className?: string;
}) {
  const toneText =
    tone === "pending"
      ? "text-amber"
      : tone === "paid"
        ? "text-teal"
        : tone === "attention"
          ? "text-red"
          : "text-ink-2";

  const inner = (
    <Card
      className={cn(
        "flex flex-col gap-[14px] rounded-xl border-rule bg-sheet p-[18px] shadow-[var(--lift)]",
        blocking && "border-red",
        href && "transition-colors hover:bg-field",
        className,
      )}
    >
      <CardContent className="flex flex-col gap-[14px] p-0">
        <div className="flex items-center justify-between gap-3">
          <span className={cn("flex items-center gap-1.5 text-[13px] font-semibold", toneText)}>
            {Icon ? <Icon className="size-[15px]" aria-hidden="true" /> : null}
            {label}
          </span>
          {blocking ? (
            <span className="rounded-[5px] bg-red-soft px-1.5 py-0.5 text-[11px] font-semibold text-red">
              {blocking}
            </span>
          ) : meta ? (
            <span className="num text-[11px] text-ink-3">{meta}</span>
          ) : null}
        </div>

        <div className="flex items-baseline gap-2.5">
          <span
            className={cn(
              "num text-[34px] leading-none font-semibold",
              blocking ? "text-red" : "text-ink",
            )}
          >
            {value}
          </span>
          {secondary ? (
            <span className="num text-sm font-semibold text-teal">{secondary}</span>
          ) : null}
        </div>

        {fact ? (
          <span className="flex items-center gap-1.5 text-xs text-ink-2">
            {FactIcon ? <FactIcon className="size-[13px] shrink-0" aria-hidden="true" /> : null}
            <span className="truncate">{fact}</span>
          </span>
        ) : null}
      </CardContent>
    </Card>
  );

  if (!href) return inner;
  return (
    <a href={href} className={cn("focus-ledger block rounded-xl", className)}>
      {inner}
    </a>
  );
}
