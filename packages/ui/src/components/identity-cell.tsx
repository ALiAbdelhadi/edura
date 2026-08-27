import { cn } from "@repo/ui/lib/utils";
import * as React from "react";

export function IdentityCell({
  name,
  meta,
  metaSuffix,
  initials,
  kind = "person",
  href,
  className,
}: {
  name: React.ReactNode;
  meta?: React.ReactNode;
  metaSuffix?: React.ReactNode;
  initials?: string;
  kind?: "person" | "center";
  href?: string;
  className?: string;
}) {
  const body = (
    <span className={cn("flex min-w-0 items-center gap-[9px]", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "flex size-[30px] shrink-0 items-center justify-center rounded-[7px] text-[11px] font-semibold",
          kind === "center" ? "bg-teal-soft text-teal" : "bg-indigo-soft text-indigo",
        )}
      >
        {initials}
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[13px] font-semibold text-ink">{name}</span>
        {meta || metaSuffix ? (
          <span className="flex min-w-0 items-center gap-1 text-[11px] text-ink-3">
            {meta ? <span className="num truncate">{meta}</span> : null}
            {meta && metaSuffix ? (
              <span aria-hidden="true" className="opacity-60">
                ·
              </span>
            ) : null}
            {metaSuffix ? <span className="truncate">{metaSuffix}</span> : null}
          </span>
        ) : null}
      </span>
    </span>
  );

  if (!href) return body;
  return (
    <a href={href} className="focus-ledger rounded-[7px] hover:underline">
      {body}
    </a>
  );
}

export function initialsOf(name: string, max = 2): string {
  return name
    .trim()
    .split(/\s+/)
    .filter((w) => !/^[أ.]{1,2}$/.test(w)) // drop the Arabic honorific "أ."
    .slice(0, max)
    .map((w) => Array.from(w)[0] ?? "")
    .join("");
}
