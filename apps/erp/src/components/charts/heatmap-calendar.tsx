"use client";

import { HeatmapCalendar as UIHeatmapCalendar } from "@repo/ui/components/charts";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";

import { isRtlLocale } from "@/i18n/routing";

/**
 * The i18n shim. `@repo/ui` has no i18n runtime, so the accessible name and the
 * weekday headings are supplied here.
 *
 * The headings are built in LTR order (Sunday first) to match the grid, which
 * sits in `ChartFrame`'s LTR island — a calendar's columns are a time axis and
 * follow the chart, not the page (CONSTITUTION §6.4).
 */
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
    // 2026-08-02 is a Sunday; the seven days after it are one full week.
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
