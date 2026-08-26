import { Card, CardContent } from "@repo/ui/components/card";
import { cn } from "@repo/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

/* <MetricCard> — replaces the gradient StatCard.
   ══════════════════════════════════════════════════════════════════════════════

   The old Overview was seven near-identical stat cards; it knew there were pending
   registrations and said nothing about them. Three things changed, each for a reason:

   1. NO GRADIENT, NO `filled` VARIANT. Hierarchy comes from ORDER and from the third
      row, not from shine. A filled card says "this one is important" without saying
      why, and once two cards are filled it says nothing at all.

   2. NO TREND-ARROW TRIO. `▲ 12%` with no referent is not information — 12% of what,
      since when, and is up good? Row 3 replaces it with the REASON THIS NUMBER
      MATTERS: `أقدم طلب: ٣ أيام — أ. شريف الجندي`. That sentence tells an operator
      what to do; a percentage does not.

   3. CARDS ARE LINKS. Each card is the door to its queue. A number an operator cannot
      act on from where they are reading it is a number they will ignore.

   The `blocking` variant is the one escalation: a red border and a chip naming the
   consequence (`يوقف الصرف`). It means something downstream is HALTED, not merely
   that a figure is bad. */

export function MetricCard({
  label,
  /** Pass a <Num> — this is a computed figure, so it is mono and tabular. */
  value,
  /** A second, smaller figure on the same baseline, e.g. the money behind the count. */
  secondary,
  /** Row 3: the one fact that explains why this number matters. Never a bare delta. */
  fact,
  factIcon: FactIcon,
  /** Top-right mono meta, e.g. `SLA 48h`. */
  meta,
  icon: Icon,
  /** Semantic state — colours the label + icon. Never decorative. */
  tone = "neutral",
  /** Something downstream is halted. Red border + chip. */
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
