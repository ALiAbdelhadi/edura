"use client";

import { cn } from "@repo/ui/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { Num } from "./num";
import { EmptyState, ErrorState } from "./primitives";

export type Column<T> = {
  id: string;
  header: React.ReactNode;
  srOnly?: boolean;
  latin?: boolean;
  numeric?: boolean;
  cell: (row: T) => React.ReactNode;
  width?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  density,
  empty,
  error,
  page,
  pageSize,
  total,
  onPageChange,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  density?: "compact" | "comfortable" | "touch";
  empty?: React.ReactNode;
  error?: { title: React.ReactNode; hint?: React.ReactNode; onRetry?: () => void } | null;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  caption?: React.ReactNode;
}) {
  const t = useTranslations();

  const paginated = page != null && pageSize != null && total != null && total > 0;
  const from = paginated ? (page - 1) * pageSize + 1 : 0;
  const to = paginated ? Math.min(page * pageSize, total) : 0;
  const lastPage = paginated ? Math.max(1, Math.ceil(total / pageSize)) : 1;

  return (
    <div className="lg-card overflow-hidden" data-density={density}>
      <div className="overflow-x-auto">
        <table className="lg-table">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  style={c.width ? { width: c.width } : undefined}
                  data-numeric={c.numeric || undefined}
                  data-latin={c.latin || undefined}
                >
                  {c.srOnly ? <span className="sr-only">{c.header}</span> : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr>
                <td colSpan={columns.length}>
                  <ErrorState
                    title={error.title}
                    hint={error.hint}
                    onRetry={error.onRetry}
                    retryLabel={t("actions.retry")}
                  />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  {empty ?? <EmptyState title={t("shared.ledger.noRows")} />}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const key = rowKey(row);
                return (
                  <tr
                    key={key}
                    data-clickable={onRowClick ? true : undefined}
                    data-selected={selectedKey === key || undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onRowClick(row);
                            }
                          }
                        : undefined
                    }
                    tabIndex={onRowClick ? 0 : undefined}
                    aria-selected={onRowClick ? selectedKey === key : undefined}
                  >
                    {columns.map((c) => (
                      <td key={c.id} data-numeric={c.numeric || undefined}>
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {paginated ? (
        <div className="flex items-center justify-between gap-3 border-t border-(--rule) bg-(--field) px-4.5 py-3">
          <Num className="text-[11px] text-(--ink-3)">
            {from}–{to} / {total}
          </Num>
          <div className="flex items-center gap-1.5">
            <PagerButton
              label={t("actions.previousPage")}
              disabled={page <= 1}
              onClick={() => onPageChange?.(page - 1)}
              dir="prev"
            />
            <PagerButton
              label={t("actions.nextPage")}
              disabled={page >= lastPage}
              onClick={() => onPageChange?.(page + 1)}
              dir="next"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PagerButton({
  label,
  disabled,
  onClick,
  dir,
}: {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  dir: "prev" | "next";
}) {
  const Icon = dir === "prev" ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-md border border-(--rule) bg-(--sheet) text-(--ink-2)",
        "disabled:opacity-40",
        !disabled && "hover:bg-(--rule-2)",
      )}
    >
      <Icon className="size-4 rtl:-scale-x-100" />
    </button>
  );
}
