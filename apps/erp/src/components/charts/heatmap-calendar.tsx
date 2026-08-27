"use client";

import { HeatmapCalendar as UIHeatmapCalendar } from "@repo/ui/components/charts";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";

import { isRtlLocale } from "@/i18n/routing";

export function HeatmapCalendar(
  props: Omit<
    React.ComponentProps<typeof UIHeatmapCalendar>,
    "ariaLabel" | "weekdayLabels" | "pageDir"
  >,
) {
  const t = useTranslations();
  const locale = useLocale();
  const pageDir = isRtlLocale(locale) ? "rtl" : "ltr";

  const weekdayLabels = React.useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
    return Array.from({ length: 7 }, (_, i) =>
      fmt.format(new Date(Date.UTC(2026, 7, 2 + i))),
    );
  }, [locale]);

  return (
    <UIHeatmapCalendar
      {...props}
      weekdayLabels={weekdayLabels}
      pageDir={pageDir}
      ariaLabel={t("common.calendarHeatmap")}
    />
  );
}
