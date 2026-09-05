"use client";

import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { useKitStrings } from "@repo/ui/lib/kit-strings";
import { cn } from "@repo/ui/lib/utils";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronLeft, ChevronUp, ChevronsUpDown } from "lucide-react";
import * as React from "react";

export type { ColumnDef };

export type DataTableDensity = "compact" | "comfortable" | "touch";

const DENSITY: Record<DataTableDensity, { head: string; cell: string; text: string }> = {
  compact: { head: "h-[34px] px-3", cell: "px-3 py-[7px]", text: "text-[13px]" },
  comfortable: { head: "h-[42px] px-3.5", cell: "px-3.5 py-[13px]", text: "text-sm" },
  touch: { head: "h-12 px-4", cell: "px-4 py-3 min-h-12", text: "text-base" },
};

export type DataTableMobile = "scroll" | "cards";

export type DataTableLabels = {
  rowsPerPage?: string;
  previousPage?: string;
  nextPage?: string;
  sortBy?: string;
  selectRow?: string;
  selectAll?: string;
};

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function alignClass(column: { columnDef: { meta?: unknown } }): string | undefined {
  const align = (column.columnDef.meta as { align?: "end" | "center" } | undefined)?.align;
  return align === "end" ? "text-end" : align === "center" ? "text-center" : undefined;
}

function mobileLabelFor(column: {
  columnDef: { header?: unknown; meta?: unknown };
}): React.ReactNode {
  const header = column.columnDef.header;
  const srLabel = (column.columnDef.meta as { srLabel?: string } | undefined)?.srLabel;
  if (typeof header === "string") return header.trim() ? header : (srLabel ?? null);
  if (typeof header === "function" || header == null) return srLabel ?? null;
  return header as React.ReactNode;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  pageSize = 10,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  emptyState,
  className,
  density = "compact",
  labels,
  selectable = false,
  onSelectionChange,
  bulkActions,
  stickyFirstColumn = false,
  mobile = "scroll",
  rowHref,
  rowDisabled,
  onRowClick,
  rowLabel,
  isLoading = false,
  error,
}: {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pageSize?: number;
  pageSizeOptions?: number[];
  emptyState?: React.ReactNode;
  className?: string;
  density?: DataTableDensity;
  labels?: DataTableLabels;
  selectable?: boolean;
  onSelectionChange?: (rows: TData[]) => void;
  bulkActions?: (rows: TData[]) => React.ReactNode;
  stickyFirstColumn?: boolean;
  mobile?: DataTableMobile;
  rowHref?: (row: TData) => string | undefined;
  rowDisabled?: (row: TData) => boolean;
  onRowClick?: (row: TData) => void;
  rowLabel?: (row: TData) => string | undefined;
  isLoading?: boolean;
  error?: React.ReactNode;
}) {
  const strings = useKitStrings();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const allColumns = React.useMemo<ColumnDef<TData, TValue>[]>(() => {
    if (!selectable) return columns;
    const selectColumn = {
      id: "__select__",
      header: ({ table }: any) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(v: boolean) => table.toggleAllPageRowsSelected(!!v)}
          aria-label={labels?.selectAll ?? strings.selectAll}
        />
      ),
      cell: ({ row }: any) => (
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onCheckedChange={(v: boolean) => row.toggleSelected(!!v)}
          aria-label={labels?.selectRow ?? strings.selectRow}
        />
      ),
      enableSorting: false,
      meta: { srLabel: labels?.selectRow ?? strings.selectRow },
    } as unknown as ColumnDef<TData, TValue>;
    return [selectColumn, ...columns];
  }, [columns, selectable, labels?.selectAll, labels?.selectRow, strings]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, ...(selectable ? { rowSelection } : {}) },
    onSortingChange: setSorting,
    onRowSelectionChange: selectable ? setRowSelection : undefined,
    enableRowSelection: selectable
      ? (row) => (rowDisabled ? !rowDisabled(row.original) : true)
      : false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const selectedRows = React.useMemo(
    () => (selectable ? table.getSelectedRowModel().rows.map((r) => r.original) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectable, rowSelection, data],
  );

  React.useEffect(() => {
    if (selectable) onSelectionChange?.(selectedRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRows]);

  const { pageIndex, pageSize: size } = table.getState().pagination;
  const from = data.length === 0 ? 0 : pageIndex * size + 1;
  const to = Math.min((pageIndex + 1) * size, data.length);
  const sizeOptions = [...new Set([...pageSizeOptions, size])].sort((a, b) => a - b);
  const canControlPageSize = data.length > Math.min(...pageSizeOptions);
  const d = DENSITY[density];

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {selectable && selectedRows.length > 0 && bulkActions ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rule bg-field px-3 py-2">
          {bulkActions(selectedRows)}
        </div>
      ) : null}

      <div
        className={cn(
          "overflow-hidden rounded-xl border border-rule bg-sheet shadow-[var(--lift)]",
          mobile === "cards" && "max-md:hidden",
        )}
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="border-rule bg-field hover:bg-field">
                {hg.headers.map((header, i) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const srLabel = (header.column.columnDef.meta as any)?.srLabel as
                    | string
                    | undefined;
                  const rendered = header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext());
                  const isEmptyHeader =
                    !header.isPlaceholder &&
                    (header.column.columnDef.header === "" ||
                      header.column.columnDef.header === undefined);

                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      aria-sort={
                        canSort
                          ? sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : "none"
                          : undefined
                      }
                      className={cn(
                        d.head,
                        // ink-2, not ink-3: at 10px uppercase this is the
                        // smallest text in the table, and ink-3 on --field
                        // measures 4.56:1 -- passing AA by 1%, with nothing
                        // left for antialiasing. ink-2 is 5.38:1.
                        "text-[10px] font-semibold text-ink-2",
                        stickyFirstColumn &&
                          i === 0 &&
                          "sticky start-0 z-10 bg-field",
                      )}
                    >
                      {canSort ? (
                        <button
                          type="button"
                          className="focus-ledger inline-flex items-center gap-1 transition-colors hover:text-ink"
                          onClick={header.column.getToggleSortingHandler()}
                          aria-label={
                            labels?.sortBy && typeof header.column.columnDef.header === "string"
                              ? `${labels.sortBy} ${header.column.columnDef.header}`
                              : undefined
                          }
                        >
                          {rendered}
                          {sorted === "asc" ? (
                            <ChevronUp className="size-3.5" aria-hidden="true" />
                          ) : sorted === "desc" ? (
                            <ChevronDown className="size-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        rendered
                      )}
                      {isEmptyHeader && srLabel ? (
                        <span className="sr-only">{srLabel}</span>
                      ) : null}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {error ? (
              <TableRow>
                <TableCell
                  colSpan={allColumns.length}
                  className="h-32 text-center text-sm font-semibold text-red"
                  role="alert"
                >
                  {error}
                </TableCell>
              </TableRow>
            ) : isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={allColumns.length}
                  className="h-32 text-center text-sm text-ink-3"
                  role="status"
                  aria-live="polite"
                >
                  {emptyState ?? "…"}
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => {
                const href = rowHref?.(row.original);
                const disabled = rowDisabled?.(row.original) ?? false;
                const selected = selectable && row.getIsSelected();
                const clickable = !disabled && Boolean(onRowClick);
                return (
                  <TableRow
                    key={row.id}
                    data-disabled={disabled || undefined}
                    aria-disabled={disabled || undefined}
                    {...(clickable
                      ? {
                          role: "button" as const,
                          tabIndex: 0,
                          "aria-label": rowLabel?.(row.original),
                          onClick: () => onRowClick?.(row.original),
                          onKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            if (event.target !== event.currentTarget) return;
                            event.preventDefault();
                            onRowClick?.(row.original);
                          },
                        }
                      : {})}
                    className={cn(
                      "border-rule-2",
                      d.text,
                      clickable && "focus-ledger",
                      disabled && "opacity-50",
                      !disabled && (href || onRowClick) && "cursor-pointer",
                      selected && "bg-indigo-soft shadow-[inset_3px_0_0_var(--indigo)] rtl:shadow-[inset_-3px_0_0_var(--indigo)]",
                    )}
                  >
                    {row.getVisibleCells().map((cell, i) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          d.cell,
                          alignClass(cell.column),
                          stickyFirstColumn && i === 0 && "sticky start-0 z-10 bg-sheet",
                        )}
                      >
                        {href && i === 0 && !disabled ? (
                          <a href={href} className="focus-ledger block">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </a>
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={allColumns.length}
                  className="h-32 text-center text-ink-3"
                >
                  {emptyState ?? "—"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {mobile === "cards" ? (
        <div className="flex flex-col gap-2 md:hidden">
          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-rule bg-sheet p-6 text-center text-sm font-semibold text-red shadow-[var(--lift)]"
            >
              {error}
            </div>
          ) : isLoading ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl border border-rule bg-sheet p-6 text-center text-sm text-ink-3 shadow-[var(--lift)]"
            >
              {emptyState ?? "…"}
            </div>
          ) : table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => {
              const href = rowHref?.(row.original);
              const disabled = rowDisabled?.(row.original) ?? false;
              const selected = selectable && row.getIsSelected();
              const clickable = !disabled && Boolean(onRowClick);
              const cells = row.getVisibleCells();
              const selectCell = cells.find((c) => c.column.id === "__select__");
              const [titleCell, ...restCells] = cells.filter(
                (c) => c.column.id !== "__select__",
              );

              return (
                <div
                  key={row.id}
                  data-disabled={disabled || undefined}
                  aria-disabled={disabled || undefined}
                  {...(clickable
                    ? {
                        role: "button" as const,
                        tabIndex: 0,
                        "aria-label": rowLabel?.(row.original),
                        onClick: () => onRowClick?.(row.original),
                        onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          if (event.target !== event.currentTarget) return;
                          event.preventDefault();
                          onRowClick?.(row.original);
                        },
                      }
                    : {})}
                  className={cn(
                    "rounded-xl border border-rule bg-sheet px-3.5 py-3 shadow-[var(--lift)]",
                    d.text,
                    clickable && "focus-ledger",
                    disabled && "opacity-50",
                    !disabled && (href || onRowClick) && "cursor-pointer",
                    selected &&
                      "bg-indigo-soft shadow-[inset_3px_0_0_var(--indigo)] rtl:shadow-[inset_-3px_0_0_var(--indigo)]",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    {selectCell ? (
                      <div className="pt-0.5">
                        {flexRender(
                          selectCell.column.columnDef.cell,
                          selectCell.getContext(),
                        )}
                      </div>
                    ) : null}
                    {titleCell ? (
                      <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden font-semibold whitespace-nowrap">
                        {href && !disabled ? (
                          <a href={href} className="focus-ledger block">
                            {flexRender(
                              titleCell.column.columnDef.cell,
                              titleCell.getContext(),
                            )}
                          </a>
                        ) : (
                          flexRender(titleCell.column.columnDef.cell, titleCell.getContext())
                        )}
                      </div>
                    ) : null}
                  </div>

                  {restCells.length ? (
                    <dl className="mt-2.5 flex flex-col gap-1.5 border-t border-rule-2 pt-2.5">
                      {restCells.map((cell) => {
                        const label = mobileLabelFor(cell.column);
                        const value = flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        );
                        if (!label) {
                          return (
                            <dd
                              key={cell.id}
                              className="flex flex-wrap items-center gap-2 [&:empty]:hidden"
                            >
                              {value}
                            </dd>
                          );
                        }
                        return (
                          <div
                            key={cell.id}
                            className="flex items-baseline justify-between gap-3"
                          >
                            <dt className="shrink-0 text-[10px] font-semibold text-ink-3">
                              {label}
                            </dt>
                            <dd className="min-w-0 overflow-x-auto overflow-y-hidden text-end whitespace-nowrap">
                              {value}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="rounded-xl border border-rule bg-sheet p-6 text-center text-ink-3 shadow-[var(--lift)]">
              {emptyState ?? "—"}
            </div>
          )}
        </div>
      ) : null}

      {table.getPageCount() > 1 || canControlPageSize ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rule bg-field px-3 py-2">
          <div className="flex items-center gap-4">
            <p className="num text-sm text-ink-2">
              {from}–{to} / {data.length}
            </p>
            {canControlPageSize ? (
              <div className="flex items-center gap-2">
                <p className="text-sm text-ink-2">{labels?.rowsPerPage}</p>
                <Select
                  value={String(size)}
                  onValueChange={(value) => table.setPageSize(Number(value))}
                >
                  <SelectTrigger size="sm" aria-label={labels?.rowsPerPage}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sizeOptions.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          {table.getPageCount() > 1 ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size={density === "touch" ? "icon-lg" : "icon-sm"}
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                aria-label={labels?.previousPage}
              >
                <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                size={density === "touch" ? "icon-lg" : "icon-sm"}
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                aria-label={labels?.nextPage}
              >
                <ChevronLeft
                  className="size-4 -scale-x-100 rtl:scale-x-100"
                  aria-hidden="true"
                />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
