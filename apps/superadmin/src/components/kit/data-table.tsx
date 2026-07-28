"use client";

import { DataTable as UIDataTable, type ColumnDef } from "@repo/ui/components/data-table";
import { useTranslations } from "next-intl";
import * as React from "react";

export type { ColumnDef };
export type { DataTableDensity, DataTableLabels } from "@repo/ui/components/data-table";

/* Shim → @repo/ui/components/data-table.
   NOT a bare re-export: @repo/ui carries no i18n runtime, so the table's own chrome
   copy is injected here. This is what fixes the hard-coded English `aria-label`s on
   the pagination buttons, which shipped regardless of locale. */
export function DataTable<TData, TValue>(
  props: Omit<React.ComponentProps<typeof UIDataTable<TData, TValue>>, "labels"> & {
    labels?: Partial<React.ComponentProps<typeof UIDataTable<TData, TValue>>["labels"]>;
  },
) {
  const t = useTranslations("actions");
  const labels = React.useMemo(
    () => ({
      rowsPerPage: t("rowsPerPage"),
      previousPage: t("previousPage"),
      nextPage: t("nextPage"),
      sortBy: t("sortBy"),
      selectRow: t("selectRow"),
      selectAll: t("selectAll"),
      ...props.labels,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, props.labels],
  );
  return <UIDataTable {...props} labels={labels} />;
}
