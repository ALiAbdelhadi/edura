import { cn } from "@repo/ui/lib/utils";
import * as React from "react";

/* <IdentityCell> — the first column of every table in the product.
   ══════════════════════════════════════════════════════════════════════════════

   One person or one center, rendered the same way everywhere, because a reader
   scanning a payouts table and a roster table should not have to re-learn where the
   name is.

   The second line is the reason this is a component and not three divs: it holds an
   email, a code, or a role — Latin runs inside Arabic rows — and it is the single most
   common site of a bidi break in the product. It is isolated here, once. Real data
   from the seed (`ovsdemo-3@edura.test` beside `أ. شريف الجندي`) is the worst case and
   it is the default case. */

export function IdentityCell({
  name,
  /** Email, code, or `TRX-` ref. Always mono, always direction-isolated. */
  meta,
  /** Free text after the meta, e.g. a role. Follows the page direction. */
  metaSuffix,
  initials,
  /** `person` = indigo tile, `center` = teal. Two entity kinds, two fills. */
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

/** Initials from a name, script-agnostic: takes the first letter of the first two
    words, which works for `أ. شريف الجندي` and `Sherif El-Gindy` alike. */
export function initialsOf(name: string, max = 2): string {
  return name
    .trim()
    .split(/\s+/)
    .filter((w) => !/^[أ.]{1,2}$/.test(w)) // drop the Arabic honorific "أ."
    .slice(0, max)
    .map((w) => Array.from(w)[0] ?? "")
    .join("");
}
