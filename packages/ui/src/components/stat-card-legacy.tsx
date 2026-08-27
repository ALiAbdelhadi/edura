import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
import { Card, CardContent } from "@repo/ui/components/card";

type Trend = "up" | "down" | "flat";

const trendChip: Record<Trend, string> = {
  up: "bg-success/10 text-success",
  down: "bg-destructive/10 text-destructive",
  flat: "bg-muted text-muted-foreground",
};

const TrendIcon: Record<Trend, LucideIcon> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
};

export function StatCard({
  label,
  value,
  unit,
  hint,
  trend,
  trendValue,
  icon: Icon,
  accent = false,
  filled = false,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  hint?: React.ReactNode;
  trend?: Trend;
  trendValue?: React.ReactNode;
  icon?: LucideIcon;
  accent?: boolean;
  filled?: boolean;
  className?: string;
}) {
  const Arrow = trend ? TrendIcon[trend] : null;
  return (
    <Card
      className={cn(
        "gap-0 py-5 transition-shadow",
        accent && !filled && "border-indigo/20",
        filled &&
          "bg-indigo border-transparent text-indigo-ink",
        className,
      )}
    >
      <CardContent className="flex items-start justify-between gap-3 px-5">
        <div className="min-w-0 space-y-2">
          <p
            className={cn(
              "truncate text-sm font-medium",
              filled ? "text-primary-foreground/80" : "text-muted-foreground",
            )}
          >
            {label}
          </p>
          <p
            className={cn(
              "text-[1.75rem] leading-none font-bold tracking-tight tabular-nums",
              filled ? "text-primary-foreground" : "text-foreground",
            )}
          >
            {value}
            {unit ? (
              <span
                className={cn(
                  "ms-1 text-base font-normal",
                  filled
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground",
                )}
              >
                {unit}
              </span>
            ) : null}
          </p>
          {trendValue || hint ? (
            <div className="flex items-center gap-1.5 pt-0.5">
              {trendValue ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold",
                    trend ? trendChip[trend] : trendChip.flat,
                  )}
                >
                  {Arrow ? <Arrow className="size-3" /> : null}
                  {trendValue}
                </span>
              ) : null}
              {hint ? (
                <span className="truncate text-xs text-muted-foreground">
                  {hint}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {Icon ? (
          <div
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl",
              filled
                ? "bg-white/15 text-primary-foreground"
                : accent
                  ? "bg-indigo text-indigo-ink"
                  : "bg-primary/10 text-primary",
            )}
          >
            <Icon className="size-5" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
