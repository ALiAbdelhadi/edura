"use client";

import { Calendar as BaseCalendar } from "@repo/ui/components/calendar";
import { format } from "date-fns";
import { arEG, enUS } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import type { ComponentProps } from "react";

export function Calendar({
  locale,
  labels,
  ...props
}: ComponentProps<typeof BaseCalendar>) {
  const t = useTranslations("shared.calendar");
  const appLocale = useLocale();
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
