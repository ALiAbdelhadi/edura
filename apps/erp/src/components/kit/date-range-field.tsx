"use client";

import { Calendar } from "@/components/kit/calendar";
import { parseDateKey, pickedDateKey } from "@repo/shared/date-key";
import { Button } from "@repo/ui/components/button";
import type { DateRange } from "@repo/ui/components/calendar";
import { Num } from "@repo/ui/components/num";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/popover";
import { Calendar as CalendarIcon, X } from "lucide-react";

export type DateKeyRange = { from: string; to: string };

export const EMPTY_RANGE: DateKeyRange = { from: "", to: "" };

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
  placeholder: string;
  clearLabel?: string;
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
