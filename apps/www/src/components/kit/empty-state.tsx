import type { LucideIcon } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@repo/ui/components/empty";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Empty
      className={cn(
        "border border-dashed border-border bg-muted/30",
        className,
      )}
    >
      <EmptyHeader>
        {Icon ? (
          <EmptyMedia variant="icon" className="bg-primary/10 text-primary">
            <Icon />
          </EmptyMedia>
        ) : null}
        <EmptyTitle>{title}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
