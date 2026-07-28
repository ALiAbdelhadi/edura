"use client";

import { Calendar as BaseCalendar } from "@repo/ui/components/calendar";
import { arEG, enUS } from "date-fns/locale";
import { useLocale } from "next-intl";
import type { ComponentProps } from "react";

/**
 * The shared @repo/ui calendar with its month captions, weekday names and
 * day aria-labels bound to the active app locale. Arabic uses ar-EG, which
 * renders Egyptian month names while keeping Latin digits — the same
 * convention as `intlLocale()` in lib/i18n/format.ts.
 */
export function Calendar({
  locale,
  ...props
}: ComponentProps<typeof BaseCalendar>) {
  const appLocale = useLocale();
  return (
    <BaseCalendar
      locale={locale ?? (appLocale === "ar" ? arEG : enUS)}
      {...props}
    />
  );
}
