import * as React from "react";

import { cn } from "@repo/ui/lib/utils";
import type { Locale } from "@repo/ui/lib/format";

export type WordmarkProps = Omit<React.ComponentProps<"span">, "children"> & {
  locale: Locale;
  tone?: "ink" | "reverse";
  size?: number;
  rule?: boolean;
};

const CAP = 0.7;

export function Wordmark({
  locale,
  tone = "ink",
  size = 20,
  rule = true,
  className,
  style,
  ...props
}: WordmarkProps) {
  const arabic = locale === "ar";

  return (
    <span
      dir={arabic ? "rtl" : "ltr"}
      className={cn("inline-flex items-baseline", className)}
      style={{
        gap: rule ? 9 : 0,
        fontSize: size,
        lineHeight: 1,
        color: tone === "reverse" ? "var(--paper)" : "var(--ink)",
        ...style,
      }}
      {...props}
    >
      {rule ? (
        <span
          aria-hidden
          style={{
            width: 3,
            height: size * CAP * 0.68,
            flex: "none",
            backgroundColor: "var(--gold)",
          }}
        />
      ) : null}
      <span
        style={
          arabic
            ? {
                fontFamily: "var(--ar-display)",
                fontWeight: 700,
              }
            : {
                fontFamily: "var(--lat-display)",
                fontWeight: 500,
                letterSpacing: "-0.012em",
              }
        }
      >
        {arabic ? "إدورا" : "Edura"}
      </span>
    </span>
  );
}
