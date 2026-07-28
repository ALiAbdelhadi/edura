"use client"

import * as React from "react"
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { ChevronDown, ChevronLeft, ChevronUp, ChevronsUpDown } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table"
import { Button } from "@repo/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select"
import { cn } from "@repo/ui/lib/utils"
import { Num } from "@repo/ui/components/num"

export type { ColumnDef }

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

export type TableDensity = "compact" | "comfortable" | "touch"

/**
 * Density, per design/DECISIONS.md D-09. `compact` is the default because the
 * operator portals (superadmin, teacher, assistant, center admin) are the ones
 * scanning many rows at once.
 *
 * `touch` is a PROP, not a fork: the center counter runs the same ceremony as
 * every other portal, with different ergonomics. 48px targets, 16px minimum
 * type, nothing actionable at 12px.
 */
const DENSITY = {
  compact: {
    head: "h-[34px] px-3 text-[10px]",
    cell: "px-3 py-[7px] text-[13px]",
  },
  comfortable: {
    head: "h-[42px] px-3.5 text-[10px]",
    cell: "px-3.5 py-[13px] text-sm",
  },
  touch: {
    head: "h-12 px-4 text-xs",
    cell: "px-4 py-3 text-base min-h-12",
  },
} as const

/**
 * Strings the table renders. Passed in rather than read from a translation
 * hook so `packages/ui` stays framework-agnostic — and so these can never
 * again ship as hardcoded English, which is what the audit found on the
 * pagination and sort controls.
 */
export interface DataTableLabels {
  rowsPerPage: string
  previousPage: string
  nextPage: string
  sortBy: (column: string) => string
  /** Announced range, e.g. "1–10 / 166". */
  range: (from: number, to: number, total: number) => React.ReactNode
  empty: React.ReactNode
}

const DEFAULT_LABELS: DataTableLabels = {
  rowsPerPage: "Rows per page",
  previousPage: "Previous page",
  nextPage: "Next page",
  sortBy: (c) => `Sort by ${c}`,
  range: (from, to, total) => `${from}–${to} / ${total}`,
  empty: "—",
}

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  pageSize?: number
  pageSizeOptions?: number[]
  emptyState?: React.ReactNode
  className?: string
  labels?: Partial<DataTableLabels>

  density?: TableDensity
  /**
   * Freeze the first column horizontally. The gradebook needs this: a student
   * name that scrolls away makes every score in the row unattributable.
   */
  stickyFirstColumn?: boolean

  /** Stable row id. Required for selection and disabled states. */
  getRowId?: (row: TData) => string
  /** Selected row drives the decision panel; selecting is the row action. */
  selectedId?: string | null
  onSelectRow?: (id: string, row: TData) => void
  /** Rows that cannot be selected or actioned, with the reason exposed. */
  isRowDisabled?: (row: TData) => boolean
  /** Whole-row link. Mutually exclusive with onSelectRow. */
  getRowHref?: (row: TData) => string | undefined
}

function DataTable<TData, TValue>({
  columns,
  data,
  pageSize = 10,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  emptyState,
  className,
  labels: labelOverrides,
  density = "compact",
  stickyFirstColumn = false,
  getRowId,
  selectedId,
  onSelectRow,
  isRowDisabled,
  getRowHref,
}: DataTableProps<TData, TValue>) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides }
  const d = DENSITY[density]
  const [sorting, setSorting] = React.useState<SortingState>([])

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  })

  const { pageIndex, pageSize: size } = table.getState().pagination
  const from = data.length === 0 ? 0 : pageIndex * size + 1
  const to = Math.min((pageIndex + 1) * size, data.length)

  const sizeOptions = [...new Set([...pageSizeOptions, size])].sort((a, b) => a - b)
  const canControlPageSize = data.length > Math.min(...pageSizeOptions)

  const stick = (index: number) =>
    stickyFirstColumn && index === 0
      ? "sticky start-0 z-10 bg-sheet"
      : undefined

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="overflow-x-auto rounded-lg border border-rule bg-sheet shadow-lift">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="border-rule bg-field">
                {hg.headers.map((header, i) => {
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  // Every column needs a real accessible name. The audit found
                  // three columns shipping `header: ""` — date and actions had
                  // no name at all. `aria-label` on the cell is the floor.
                  const name =
                    typeof header.column.columnDef.header === "string"
                      ? header.column.columnDef.header
                      : header.column.id
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      aria-label={name || undefined}
                      className={cn(
                        "font-mono font-semibold tracking-[0.1em] text-ink-3 uppercase",
                        d.head,
                        stick(i),
                        stickyFirstColumn && i === 0 && "bg-field",
                      )}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 transition-colors hover:text-ink"
                          onClick={header.column.getToggleSortingHandler()}
                          aria-label={labels.sortBy(name)}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {sorted === "asc" ? (
                            <ChevronUp className="size-3.5" />
                          ) : sorted === "desc" ? (
                            <ChevronDown className="size-3.5" />
                          ) : (
                            <ChevronsUpDown className="size-3.5 opacity-50" />
                          )}
                        </button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => {
                const original = row.original
                const id = getRowId?.(original)
                const selected = id != null && id === selectedId
                const disabled = isRowDisabled?.(original) ?? false
                const href = getRowHref?.(original)
                const selectable = !!onSelectRow && !disabled && id != null

                return (
                  <TableRow
                    key={row.id}
                    data-selected={selected || undefined}
                    aria-selected={onSelectRow ? selected : undefined}
                    aria-disabled={disabled || undefined}
                    onClick={
                      selectable ? () => onSelectRow(id!, original) : undefined
                    }
                    className={cn(
                      "border-rule-2 transition-colors",
                      disabled && "opacity-55",
                      selectable && "cursor-pointer",
                      !disabled && "hover:bg-rule-2",
                      // 3px inset side bar, direction-aware. Emphasis is a rule,
                      // not a tonal background shift.
                      selected && "bg-indigo-soft bar-selected",
                    )}
                  >
                    {row.getVisibleCells().map((cell, i) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          d.cell,
                          stick(i),
                          selected && stickyFirstColumn && i === 0 && "bg-indigo-soft",
                        )}
                      >
                        {href && i === 0 ? (
                          <a href={href} className="hover:underline">
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </a>
                        ) : (
                          flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-ink-3"
                >
                  {emptyState ?? labels.empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {table.getPageCount() > 1 || canControlPageSize ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-field px-[18px] py-3">
            <div className="flex items-center gap-4">
              <Num className="text-[11px] text-ink-3">
                {labels.range(from, to, data.length)}
              </Num>
              {canControlPageSize ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-3">{labels.rowsPerPage}</span>
                  <Select
                    value={String(size)}
                    onValueChange={(v) => table.setPageSize(Number(v))}
                  >
                    <SelectTrigger size="sm" aria-label={labels.rowsPerPage}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sizeOptions.map((o) => (
                        <SelectItem key={o} value={String(o)}>
                          {o}
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
                  size="icon-sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  aria-label={labels.previousPage}
                >
                  <ChevronLeft className="size-4 rtl:-scale-x-100" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  aria-label={labels.nextPage}
                >
                  <ChevronLeft className="size-4 -scale-x-100 rtl:scale-x-100" />
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export { DataTable }
