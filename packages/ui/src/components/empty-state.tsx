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

/** `tone` distinguishes the three states that are NOT the same thing and were
    previously all rendered as one bare line:
      empty   nothing here yet — normal, often the correct end state
      error   we don't know what is here — the fetch failed
      denied  something IS here and you may not see it. Saying "no results" to a user
              who lacks permission is a lie about the data. */
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
        // The BORDER carries the distinction, not just the words. A dashed box
        // reads as an outline waiting to be filled — nothing is here yet. A
        // SOLID filled box reads as a closed surface — something is here and it
        // is not for you. Rendering "denied" dashed, as this did, told a user
        // without permission that the shelf was empty.
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
