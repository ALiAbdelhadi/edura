import { cn } from "@repo/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

export type StatusTone =
  | "pending"
  | "paid"
  | "rejected"
  | "active"
  | "neutral"
  | "success"
  | "warning"
  | "info"
  | "danger"
  | "primary";

const TONE: Record<StatusTone, string> = {
  pending: "bg-amber-soft text-amber",
  paid: "bg-teal-soft text-teal",
  rejected: "bg-red-soft text-red",
  active: "bg-indigo-soft text-indigo",
  neutral: "bg-field text-ink-2",
  success: "bg-teal-soft text-teal",
  warning: "bg-amber-soft text-amber",
  info: "bg-indigo-soft text-indigo",
  danger: "bg-red-soft text-red",
  primary: "bg-indigo-soft text-indigo",
};

export function StatusBadge({
  tone = "neutral",
  icon: Icon,
  age,
  reason,
  script,
  className,
  children,
}: {
  tone?: StatusTone;
  icon?: LucideIcon;
  age?: React.ReactNode;
  reason?: React.ReactNode;
  script?: "latin";
  className?: string;
  children: React.ReactNode;
}) {
  const badge = (
    <span
      data-slot="status-badge"
      data-tone={tone}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-(--radius-badge) px-[9px] py-[4px] text-[12px] font-semibold sm:text-[11px]",
        script === "latin" && "num tracking-[0.04em]",
        TONE[tone],
        className,
      )}
    >
      {Icon ? <Icon className="size-3" aria-hidden="true" /> : null}
      {children}
      {age ? (
        <>
          <span aria-hidden="true" className="opacity-50">
            ·
          </span>
          <span className="num font-medium">{age}</span>
        </>
      ) : null}
    </span>
  );

  if (!reason) return badge;
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      {badge}
      <span className="text-[11px] text-red">{reason}</span>
    </span>
  );
}
