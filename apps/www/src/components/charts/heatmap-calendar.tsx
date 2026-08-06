"use client";

import { HeatmapCalendar as UIHeatmapCalendar } from "@repo/ui/components/charts";
import { useTranslations } from "next-intl";
import * as React from "react";

export function HeatmapCalendar(
  props: Omit<React.ComponentProps<typeof UIHeatmapCalendar>, "ariaLabel">,
) {
  const t = useTranslations();
  return <UIHeatmapCalendar {...props} ariaLabel={t("common.calendarHeatmap")} />;
}
