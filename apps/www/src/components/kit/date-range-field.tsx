"use client";

import { Calendar } from "@/components/kit/calendar";
import { parseDateKey, pickedDateKey } from "@repo/server-core/lib/date-key";
import { Button } from "@repo/ui/components/button";
import type { DateRange } from "@repo/ui/components/calendar";
import { Num } from "@repo/ui/components/num";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/popover";
import { Calendar as CalendarIcon, X } from "lucide-react";

/** A `from`/`to` filter, as YYYY-MM-DD. Empty string means "open on that end". */
export type DateKeyRange = { from: string; to: string };

export const EMPTY_RANGE: DateKeyRange = { from: "", to: "" };

/* <DateRangeField> — every "from … to" filter in the product.
   ══════════════════════════════════════════════════════════════════════════════

   Three things were being rebuilt every time a screen needed a date range.

   1. THE PICKER. Four filters reached for a PAIR of raw `<Input type="date">`,
      which is not the design system's control: it renders as the browser's own
      widget (different on every OS), it cannot show the two ends as one range,
      and it ignores the Ledger's field treatment. The reports screen did use the
      shadcn Calendar — but hand-assembled the Popover, trigger and label around
      it, so following that example meant copying twenty-five lines.

   2. THE LOCALE BINDING. `components/kit/calendar.tsx` exists so month captions,
      weekday names and day aria-labels follow the active locale. It had ZERO
      consumers — the one screen with a calendar imported the base
      `@repo/ui/components/calendar` directly, so its captions were English
      whatever the locale. Routing every range picker through here is what makes
      that wrapper actually reach a screen.

   3. THE CONVERSION, WHICH IS WHERE THE BUG LIVED. Every consumer speaks
      YYYY-MM-DD — that is what the queries and the client-side comparisons use —
      while the calendar speaks `Date`. Those Dates sit at LOCAL midnight, so the
      obvious `toISOString().slice(0, 10)` reads the UTC day and returns the
      PREVIOUS one anywhere east of UTC, Cairo included. Doing that conversion in
      the field, once, is why the API below is strings at both ends: no call site
      is in a position to get it wrong. See @repo/server-core/lib/date-key. */
export function DateRangeField({
  value,
  onChange,
  placeholder,
  clearLabel,
  formatDate,
  numberOfMonths = 2,
  align = "start",
  className,
}: {
  value: DateKeyRange;
  onChange: (next: DateKeyRange) => void;
  /** Shown when nothing is selected, e.g. t("…pickDateRange"). */
  placeholder: string;
  /** When given, a clear affordance appears once a range is set. */
  clearLabel?: string;
  /** Usually `formatDate` from `useFormatters()`, so the label follows locale. */
  formatDate: (value: Date) => string;
  numberOfMonths?: number;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const selected: DateRange | undefined = value.from
    ? { from: parseDateKey(value.from), to: parseDateKey(value.to) }
    : undefined;

  const label = selected?.from
    ? selected.to
      ? `${formatDate(selected.from)} – ${formatDate(selected.to)}`
      : formatDate(selected.from)
    : placeholder;

  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={
              className ??
              "min-w-56 justify-start gap-2 border-[var(--rule)] bg-[var(--field)] font-normal"
            }
          >
            <CalendarIcon className="size-4 text-[var(--ink-3)]" aria-hidden="true" />
            <Num className={selected?.from ? "text-[var(--ink)]" : "text-[var(--ink-3)]"}>
              {label}
            </Num>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align={align}>
          <Calendar
            mode="range"
            selected={selected}
            onSelect={(next) =>
              onChange({
                from: next?.from ? pickedDateKey(next.from) : "",
                to: next?.to ? pickedDateKey(next.to) : "",
              })
            }
            defaultMonth={selected?.from}
            numberOfMonths={numberOfMonths}
          />
        </PopoverContent>
      </Popover>

      {clearLabel && value.from ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={clearLabel}
          title={clearLabel}
          onClick={() => onChange(EMPTY_RANGE)}
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
