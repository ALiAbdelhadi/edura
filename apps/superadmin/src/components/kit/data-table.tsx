"use client";

// Migration shim — DataTable now lives in @repo/ui.
// This wrapper exists for ONE reason: the promoted component takes its strings
// as props so `packages/ui` stays framework-agnostic, and this is where the
// app's next-intl translations are injected. That inversion is also the fix
// for the audit finding that pagination and sort aria-labels shipped as
// hardcoded English regardless of locale.
//
// Every existing call site keeps working unchanged.

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  DataTable as UIDataTable,
  type DataTableProps,
  type ColumnDef,
  type TableDensity,
} from "@repo/ui/components/data-table";

export type { ColumnDef, TableDensity, DataTableProps };

export function DataTable<TData, TValue>(
  props: DataTableProps<TData, TValue>,
) {
  const t = useTranslations("actions");
  return (
    <UIDataTable
      {...props}
      labels={{
        rowsPerPage: t("rowsPerPage"),
        previousPage: t("previousPage"),
        nextPage: t("nextPage"),
        sortBy: (column) => t("sortBy", { column }),
        ...props.labels,
      }}
    />
  );
}
