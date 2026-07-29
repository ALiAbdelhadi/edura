"use client";

import { Calendar as BaseCalendar } from "@repo/ui/components/calendar";
import { format } from "date-fns";
import { arEG, enUS } from "date-fns/locale";
import { useTranslations, useLocale } from "next-intl";
import type { ComponentProps } from "react";

/**
 * The shared @repo/ui calendar with its month captions, weekday names and
 * aria-labels bound to the active app locale. Arabic uses ar-EG, which renders
 * Egyptian month names while keeping Latin digits — the same convention as
 * `intlLocale()` in lib/i18n/format.ts.
 *
 * react-day-picker derives captions and weekday names from `locale`, but its
 * `labels` are hard-coded English regardless of locale, so the four we can
 * actually surface (prev/next nav, and the "Today, …" / "…, selected" affixes
 * on a day cell) are translated here. "PPPP" is the same format token the
 * library's own labelDayButton/labelGridcell use.
 */
export function Calendar({
  locale,
  labels,
  ...props
}: ComponentProps<typeof BaseCalendar>) {
  const t = useTranslations("shared.calendar");
  const appLocale = useLocale();
  // DayPicker takes a Partial<DayPickerLocale>; date-fns `format` needs a full
  // Locale, so the app's own locale is what the labels format against.
  const appDateLocale = appLocale === "ar" ? arEG : enUS;

  const dayLabel = (
    date: Date,
    modifiers?: { today?: boolean; selected?: boolean },
  ) => {
    let label = format(date, "PPPP", { locale: appDateLocale });
    if (modifiers?.today) label = t("today", { date: label });
    if (modifiers?.selected) label = t("selected", { date: label });
    return label;
  };

  return (
    <BaseCalendar
      locale={locale ?? appDateLocale}
      labels={{
        labelPrevious: () => t("prevMonth"),
        labelNext: () => t("nextMonth"),
        labelDayButton: (date, modifiers) => dayLabel(date, modifiers),
        labelGridcell: (date, modifiers) => dayLabel(date, modifiers),
        ...labels,
      }}
      {...props}
    />
  );
}
