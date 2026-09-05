"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Num } from "@repo/ui/components/num";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { SearchInput } from "@repo/ui/components/search-input";
import { cn } from "@repo/ui/lib/utils";
import { RefreshCcw, TriangleAlert, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";

import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner } from "@/components/kit/spinner";
import type { ListScreen } from "@/lib/api/use-list-screen";

const ANY = "__any__";

export function ListSearch<TRow>({
  list,
  placeholder,
  clearLabel,
  className = "min-w-64 flex-1",
}: {
  list: ListScreen<TRow>;
  placeholder: string;
  clearLabel: string;
  className?: string;
}) {
  return (
    <SearchInput
      className={className}
      placeholder={placeholder}
      value={list.q}
      onValueChange={list.setQ}
      onClear={() => list.setQ("")}
      clearLabel={clearLabel}
    />
  );
}

export function ListFilter<TRow>({
  list,
  name,
  anyLabel,
  options,
  render,
}: {
  list: ListScreen<TRow>;
  name: string;
  anyLabel: string;
  options: readonly string[];
  render: (option: string) => string;
}) {
  return (
    <select
      value={list.filter(name) ?? ANY}
      aria-label={anyLabel}
      onChange={(e) => list.setFilter(name, e.target.value === ANY ? null : e.target.value)}
      className="focus-ledger h-8 rounded-lg border border-rule bg-field px-2 text-[13px] text-ink-2"
    >
      <option value={ANY}>{anyLabel}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {render(o)}
        </option>
      ))}
    </select>
  );
}

/**
 * The same choice as {@link ListFilter}, laid out as buttons — for a filter
 * with few enough options that hiding them behind a <select> costs the
 * operator a click to see where they are.
 */
export function ListButtonFilter<TRow>({
  list,
  name,
  options,
  render,
  allLabel,
}: {
  list: ListScreen<TRow>;
  name: string;
  options: readonly string[];
  render: (option: string) => string;
  allLabel: string;
}) {
  const active = list.filter(name);
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <Button
          key={o}
          size="sm"
          variant={active === o ? "default" : "outline"}
          aria-pressed={active === o}
          onClick={() => list.setFilter(name, o)}
        >
          {render(o)}
        </Button>
      ))}
      <Button
        size="sm"
        variant={active === null ? "default" : "outline"}
        aria-pressed={active === null}
        onClick={() => list.setFilter(name, null)}
      >
        {allLabel}
      </Button>
    </div>
  );
}

/**
 * A typed filter, as opposed to a picked one. The value it writes is debounced
 * by `useListScreen` when the filter is named in `textFilters`, so holding a
 * key no longer fires one request per character.
 */
export function ListTextFilter<TRow>({
  list,
  name,
  label,
  placeholder,
  className = "w-64",
  dir,
}: {
  list: ListScreen<TRow>;
  name: string;
  label: string;
  placeholder?: string;
  className?: string;
  dir?: "ltr" | "rtl";
}) {
  return (
    <label className="text-xs">
      <span className="mb-1 block text-ink-2">{label}</span>
      <Input
        value={list.filter(name) ?? ""}
        placeholder={placeholder}
        className={cn("num", className)}
        dir={dir}
        onChange={(e) => list.setFilter(name, e.target.value)}
      />
    </label>
  );
}

export function ListPagination<TRow>({ list }: { list: ListScreen<TRow> }) {
  const t = useTranslations("actions");
  if (list.pageCount <= 1) return null;
  const from = (list.page - 1) * list.pageSize + 1;
  const to = Math.min(list.page * list.pageSize, list.total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rule bg-field px-3 py-2">
      <Num className="text-[11px] text-ink-3">
        {from}–{to} / {list.total}
      </Num>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={list.page <= 1}
          onClick={() => list.setPage(list.page - 1)}
        >
          {t("previous")}
        </Button>
        <Num className="text-[11px] text-ink-3">
          {list.page} / {list.pageCount}
        </Num>
        <Button
          variant="outline"
          size="sm"
          disabled={list.page >= list.pageCount}
          onClick={() => list.setPage(list.page + 1)}
        >
          {t("next")}
        </Button>
      </div>
    </div>
  );
}

/**
 * The load-failed branch, as its own component so a screen that renders the
 * shared DataTable directly — payouts, with its selection and side-by-side
 * decision panel — reports a failure the same way ListShell does instead of
 * carrying a fifth copy of the denied/error ternary.
 *
 * 403 is a distinct state, not an error: the operator is not looking at a
 * broken screen, they are looking at one they may not open, and offering them
 * a retry button would be a lie.
 */
export function ListErrorState({
  denied,
  onRetry,
  errorTitle,
  errorDescription,
  deniedTitle,
  deniedDescription,
}: {
  denied: boolean;
  onRetry: () => void;
  errorTitle?: React.ReactNode;
  errorDescription?: React.ReactNode;
  deniedTitle?: React.ReactNode;
  deniedDescription?: React.ReactNode;
}) {
  const t = useTranslations("actions");
  const s = useQueryStrings();
  if (denied) {
    return (
      <EmptyState
        tone="denied"
        icon={TriangleAlert}
        title={deniedTitle ?? s.denied}
        description={deniedDescription}
      />
    );
  }
  return (
    <EmptyState
      tone="error"
      icon={TriangleAlert}
      title={errorTitle ?? s.loadFailed}
      description={errorDescription}
      action={
        <Button variant="outline" onClick={onRetry}>
          <RefreshCcw className="size-4" aria-hidden="true" />
          {t("retry")}
        </Button>
      }
    />
  );
}

export function ListShell<TRow, TValue = unknown>({
  list,
  title,
  description,
  actions,
  notice,
  toolbar,
  columns,
  body,
  sortable = false,
  onRowClick,
  rowLabel,
  loadingLabel,
  footer,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  errorTitle,
  errorDescription,
  deniedTitle,
  deniedDescription,
  children,
}: {
  list: ListScreen<TRow>;
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  notice?: React.ReactNode;
  toolbar?: React.ReactNode;
  /** Omit to render `body` instead — for a list DataTable cannot express. */
  columns?: ColumnDef<TRow, TValue>[];
  body?: React.ReactNode;
  sortable?: boolean;
  onRowClick?: (row: TRow) => void;
  rowLabel?: (row: TRow) => string | undefined;
  loadingLabel?: string;
  /** Replaces the page footer — for a cursor list, whose control is "load more". */
  footer?: React.ReactNode;
  emptyIcon?: LucideIcon;
  emptyTitle: React.ReactNode;
  emptyDescription?: React.ReactNode;
  errorTitle?: React.ReactNode;
  errorDescription?: React.ReactNode;
  deniedTitle?: React.ReactNode;
  deniedDescription?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const t = useTranslations();

  // The page is a server-side slice, so client-side sorting would reorder only
  // the rows already fetched and quietly lie about the rest.
  const tableColumns = React.useMemo(
    () => (sortable ? columns : columns?.map((c) => ({ ...c, enableSorting: false }))),
    [columns, sortable],
  );

  let content: React.ReactNode;
  if (list.query.isLoading) {
    content = <PageSpinner label={loadingLabel ?? t("common.loading")} />;
  } else if (list.query.isError) {
    content = (
      <ListErrorState
        denied={list.denied}
        onRetry={() => list.query.refetch()}
        errorTitle={errorTitle}
        errorDescription={errorDescription}
        deniedTitle={deniedTitle}
        deniedDescription={deniedDescription}
      />
    );
  } else if (list.rows.length === 0) {
    content = (
      <EmptyState
        tone="empty"
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  } else {
    content = (
      <>
        {tableColumns ? (
          <DataTable
            columns={tableColumns}
            data={list.rows}
            pageSize={list.pageSize}
            pageSizeOptions={[list.pageSize]}
            onRowClick={onRowClick}
            rowLabel={rowLabel}
          />
        ) : (
          body
        )}
        {footer ?? <ListPagination list={list} />}
      </>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5">
      {title ? (
        <PageHeader title={title} description={description} actions={actions} rule />
      ) : null}
      {notice}
      {toolbar ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rule bg-sheet px-4 py-3 shadow-[var(--lift)]">
          {toolbar}
        </div>
      ) : null}
      {content}
      {children}
    </div>
  );
}
