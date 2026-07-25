"use client";

import { toast } from "@repo/ui/components/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/components/tooltip";
import { cn } from "@repo/ui/lib/utils";
import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import React from "react";
type CopyableTextProps = {
  value?: string | number | null;
  label?: string;
  emptyText?: string;
  monospace?: boolean;
};

export default function CopyableText({
  value,
  label,
  emptyText,
  monospace = true,
}: CopyableTextProps) {
  const t = useTranslations();
  const text = value === undefined || value === null || value === "" ? "" : String(value);
  const emptyLabel = emptyText ?? t("shared.copyNa");

  const handleCopy = async (event: React.MouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("shared.copyCopied", { label: label || t("shared.copyValue") }));
    } catch {
      toast.error(t("shared.copyFailed"));
    }
  };

  if (!text) return <span className="text-muted-foreground">{emptyLabel}</span>;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="button"
            tabIndex={0}
            onClick={handleCopy}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleCopy(event as unknown as React.MouseEvent<HTMLSpanElement>);
              }
            }}
            className={cn(
              "inline-flex max-w-full cursor-copy items-center gap-1.5 rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs leading-relaxed text-foreground",
              monospace && "font-mono",
            )}
          >
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">
              {text}
            </span>
            <Copy className="size-3 shrink-0 text-muted-foreground" />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {t("shared.copyTooltip", {
            label: label ? label.toLowerCase() : t("shared.copyValue").toLowerCase(),
          })}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}