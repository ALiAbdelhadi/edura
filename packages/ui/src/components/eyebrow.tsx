import * as React from "react";

import { cn } from "@repo/ui/lib/utils";
import type { Locale } from "@repo/ui/lib/format";

export type EyebrowProps = React.ComponentProps<"span"> & {
  locale: Locale;
  script?: "latin" | "arabic";
  marker?: boolean;
  tone?: "current" | "gold";
  asChild?: never;
};

export function Eyebrow({
  locale,
  script,
  marker = true,
  tone = "current",
  className,
  style,
  children,
  ...props
}: EyebrowProps) {
  const resolved = script ?? (locale === "ar" ? "arabic" : "latin");

  return (
    <span
      style={
        tone === "gold"
          ? ({ "--eyebrow-marker-color": "var(--gold)", ...style } as React.CSSProperties)
          : style
      }
      className={cn(
        "inline-flex items-center text-ink-3",
        marker &&
          "before:me-[7px] before:h-[9px] before:w-[2px] before:flex-none before:rounded-[1px] before:bg-(--eyebrow-marker-color) before:content-['']",
        resolved === "latin"
          ? // ONE STEP LARGER ON A PHONE, back to 10px from `sm` up.
            "num text-[11px] font-semibold uppercase tracking-[0.12em] sm:text-[10px]"
          : // No uppercase, no tracking, no mono — see the header comment. Each of
            "text-[13px] font-bold [word-spacing:0.1em] sm:text-[12px]",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
