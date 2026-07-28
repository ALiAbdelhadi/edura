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

/* <DataTable>
   ══════════════════════════════════════════════════════════════════════════════

   ── Density is a portal-level decision, not a per-table one ──────────────────

     compact       superadmin · teacher · center admin · assistant
                   An operator scanning 166 rows. 34px header, 7px cells.
     comfortable   student · parent
                   Fewer rows, read rather than scanned, often on a 390px screen.
     touch         center staff check-in ONLY.
                   A receptionist standing, one-handed, with a parent and a queue in
                   front of them. 48px minimum target, 16px minimum type, 12px minimum
                   gap, and NOTHING actionable at 12px. `compact` does not merely look
                   wrong here — it produces mis-taps, and a mis-tap at a counter is a
                   student checked in twice.

   ── Accessible names ─────────────────────────────────────────────────────────

   Every column must have one. `registrations-queue.tsx` shipped three columns with
   `header: ""`, so date and actions were unreachable by name. A column that renders no
   visible header supplies `meta.srLabel` and gets a visually-hidden one — the choice
   is between "visible" and "screen-reader-only", never between "named" and "not".

   ── Labels ───────────────────────────────────────────────────────────────────

   @repo/ui has no i18n runtime, so all chrome copy arrives as `labels`. The app-side
   shim injects it from next-intl, which is why pagination aria-labels are no longer
   hard-coded English. */

export type DataTableDensity = "compact" | "comfortable" | "touch";

const DENSITY: Record<DataTableDensity, { head: string; cell: string; text: string }> = {
  compact: { head: "h-[34px] px-3", cell: "px-3 py-[7px]", text: "text-[13px]" },
  comfortable: { head: "h-[42px] px-3.5", cell: "px-3.5 py-[13px]", text: "text-sm" },
  // 48px row minimum, 16px type — the two numbers the counter surface is built around.
  touch: { head: "h-12 px-4", cell: "px-4 py-3 min-h-12", text: "text-base" },
};

export type DataTableLabels = {
  rowsPerPage?: string;
  previousPage?: string;
  nextPage?: string;
  sortBy?: string;
  selectRow?: string;
  selectAll?: string;
};

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export function DataTable<TData, TValue>({
  columns,
  data,
  pageSize = 10,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  emptyState,
  className,
  density = "compact",
  labels,
  // ── opt-in capabilities; every one defaults off so existing call sites are unchanged
  selectable = false,
  onSelectionChange,
  bulkActions,
  stickyFirstColumn = false,
  rowHref,
  rowDisabled,
  onRowClick,
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
  /** Rendered above the table when at least one row is selected. The selection's
      total belongs here — it must be visible BEFORE any bulk action is possible. */
  bulkActions?: (rows: TData[]) => React.ReactNode;
  /** The gradebook needs the student column pinned while marks scroll. */
  stickyFirstColumn?: boolean;
  rowHref?: (row: TData) => string | undefined;
  rowDisabled?: (row: TData) => boolean;
  onRowClick?: (row: TData) => void;
  isLoading?: boolean;
  /** Distinct from empty: "we don't know" is not "there is nothing". */
  error?: React.ReactNode;
}) {
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
          aria-label={labels?.selectAll ?? "Select all rows"}
        />
      ),
      cell: ({ row }: any) => (
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onCheckedChange={(v: boolean) => row.toggleSelected(!!v)}
          aria-label={labels?.selectRow ?? "Select row"}
        />
      ),
      enableSorting: false,
      meta: { srLabel: labels?.selectRow ?? "Select row" },
    } as unknown as ColumnDef<TData, TValue>;
    return [selectColumn, ...columns];
  }, [columns, selectable, labels?.selectAll, labels?.selectRow]);

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

      <div className="overflow-x-auto rounded-xl border border-rule bg-sheet shadow-[var(--lift)]">
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
                      className={cn(
                        d.head,
                        // Header labels are the eyebrow slot. Uppercase + tracking are
                        // applied ONLY to Latin content — see <Eyebrow> for why Arabic
                        // cannot take them. Callers pass an <Eyebrow> for Arabic.
                        "text-[10px] font-semibold text-ink-3",
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
                      {/* A column with no visible header still gets a name. */}
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
                return (
                  <TableRow
                    key={row.id}
                    data-disabled={disabled || undefined}
                    aria-disabled={disabled || undefined}
                    onClick={
                      disabled ? undefined : onRowClick ? () => onRowClick(row.original) : undefined
                    }
                    className={cn(
                      "border-rule-2",
                      d.text,
                      disabled && "opacity-50",
                      !disabled && (href || onRowClick) && "cursor-pointer",
                      // Selected row: soft fill + a 3px inset bar on the START edge.
                      // `inset 3px 0 0` is inline-aware via the logical rule below.
                      selected && "bg-indigo-soft shadow-[inset_3px_0_0_var(--indigo)] rtl:shadow-[inset_-3px_0_0_var(--indigo)]",
                    )}
                  >
                    {row.getVisibleCells().map((cell, i) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          d.cell,
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
