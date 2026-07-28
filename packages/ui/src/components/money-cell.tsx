import { cn } from "@repo/ui/lib/utils";
import type { Locale } from "@repo/ui/lib/format";
import { Num, type MoneyTone } from "@repo/ui/components/num";
import * as React from "react";

/* <MoneyCell> — an amount inside a table.
   ══════════════════════════════════════════════════════════════════════════════

   A thin, deliberate wrapper over <Num.Money>: it exists so that "an amount in a
   table" is one decision made once, rather than a `className` written 200 times.

   NEVER render an amount as an input. `transactions` and `points_ledger` carry
   REVOKE UPDATE/DELETE — an editable-looking amount field is the interface lying about
   what the database permits. There is deliberately no `editable` prop to reach for. */

export function MoneyCell({
  piasters,
  locale,
  tone = "plain",
  decimals = true,
  className,
}: {
  piasters: number | null | undefined;
  locale: Locale;
  tone?: MoneyTone;
  decimals?: boolean;
  className?: string;
}) {
  return (
    <Num.Money
      piasters={piasters}
      locale={locale}
      tone={tone}
      decimals={decimals}
      align="end"
      className={cn("block", className)}
    />
  );
}

/** The conclusion line of a computation. Carries the accountant's double rule, which
    says: this is a CONCLUSION, not another row. Use it only where the user is expected
    to act on the sum — never as decoration on the last row of a list. */
export function MoneyTotalCell({
  piasters,
  locale,
  label,
  className,
}: {
  piasters: number | null | undefined;
  locale: Locale;
  label?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rule-total flex items-baseline justify-between gap-4 pt-2", className)}>
      {label ? <span className="text-[13px] font-semibold text-ink">{label}</span> : null}
      <Num.Money
        piasters={piasters}
        locale={locale}
        tone="net"
        align="end"
        className="text-[17px]"
      />
    </div>
  );
}
