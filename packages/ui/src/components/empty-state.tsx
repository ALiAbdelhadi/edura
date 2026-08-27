import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { cn } from "@repo/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "empty",
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  tone?: "empty" | "error" | "denied";
  className?: string;
}) {
  return (
    <Empty
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "rounded-(--radius-step-lg) border",
        tone === "empty" && "border-dashed border-rule bg-transparent",
        tone === "error" && "border-red/40 bg-red-soft/40",
        tone === "denied" && "border-rule bg-field",
        className,
      )}
    >
      <EmptyHeader>
        {Icon ? (
          <EmptyMedia
            variant="icon"
            className={cn(
              tone === "error" ? "bg-red-soft text-red" : "bg-indigo-soft text-indigo",
            )}
          >
            <Icon />
          </EmptyMedia>
        ) : null}
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
