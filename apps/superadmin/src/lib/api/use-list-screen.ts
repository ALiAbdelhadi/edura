"use client";

import { useCustom, useList } from "@refinedev/core";
import { useDebounced } from "@repo/ui/hooks/use-debounced";
import type { QUERY_FRESHNESS } from "@repo/client-core/refine/freshness";
import { useCallback, useEffect, useMemo, useState } from "react";

export type Freshness = (typeof QUERY_FRESHNESS)[keyof typeof QUERY_FRESHNESS];

export type ListQuery = {
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
};

export type ListScreen<TRow> = {
  q: string;
  setQ: (value: string) => void;
  debouncedQ: string;
  filter: (name: string) => string | null;
  setFilter: (name: string, value: string | null) => void;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  pageCount: number;
  total: number;
  rows: TRow[];
  /**
   * The response body as the endpoint sent it. For a payload that carries more
   * than the page — a queue's total unread count — read it from here; calling
   * setState from `select` would be a write during render.
   */
  data: unknown;
  query: ListQuery;
  denied: boolean;
};

type ListState = {
  q: string;
  setQ: (value: string) => void;
  debouncedQ: string;
  filter: (name: string) => string | null;
  setFilter: (name: string, value: string | null) => void;
  /** What the screen shows in its inputs — immediate, never debounced. */
  filters: Record<string, string | null>;
  /** What the request should carry — text filters trail by the debounce. */
  settledFilters: Record<string, string | null>;
  page: number;
  setPage: (page: number) => void;
};

/**
 * Search box, filters and page, in one place.
 *
 * Every setter resets the page, which each screen previously had to remember
 * on its own — miss it once and a filter change leaves the operator on page 7
 * of a three-page result, looking at an empty table.
 *
 * `textFilters` names the filters that are typed rather than picked. Those
 * trail the input by the shared debounce, so an audit-log search stops issuing
 * one request per keystroke, while a <select> still applies the moment it
 * changes.
 */
function useListState(
  textFilters: readonly string[],
  initialFilters?: Record<string, string | null>,
): ListState {
  const [q, setQState] = useState("");
  const debouncedQ = useDebounced(q);
  const [filters, setFilters] = useState<Record<string, string | null>>(
    () => initialFilters ?? {},
  );
  const [page, setPageState] = useState(1);

  const setQ = useCallback((value: string) => {
    setQState(value);
    setPageState(1);
  }, []);

  const setFilter = useCallback((name: string, value: string | null) => {
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPageState(1);
  }, []);

  const filter = useCallback((name: string) => filters[name] ?? null, [filters]);

  // Serialized so one debounce covers every text filter at once; a per-filter
  // hook would break the rules-of-hooks the moment a screen changed its list.
  const typedKey = JSON.stringify(
    Object.fromEntries(textFilters.map((name) => [name, filters[name] ?? null])),
  );
  const settledTypedKey = useDebounced(typedKey);
  const settledFilters = useMemo(() => {
    const typed = JSON.parse(settledTypedKey) as Record<string, string | null>;
    return { ...filters, ...typed };
  }, [settledTypedKey, filters]);

  return {
    q,
    setQ,
    debouncedQ,
    filter,
    setFilter,
    filters,
    settledFilters,
    page,
    setPage: setPageState,
  };
}

function narrowQuery(query: {
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}): ListQuery {
  return {
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: () => query.refetch(),
  };
}

function isDenied(error: unknown): boolean {
  return (error as { statusCode?: number } | null)?.statusCode === 403;
}

export function useListScreen<TRow>({
  resource,
  pageSize = 20,
  searchField = "q",
  textFilters = [],
  initialFilters,
  enabled = true,
  freshness,
}: {
  resource: string;
  pageSize?: number;
  searchField?: string;
  textFilters?: readonly string[];
  initialFilters?: Record<string, string | null>;
  enabled?: boolean;
  freshness?: Freshness;
}): ListScreen<TRow> {
  const state = useListState(textFilters, initialFilters);

  const activeFilters = useMemo(() => {
    const list: { field: string; operator: "eq"; value: string }[] = [];
    if (state.debouncedQ) {
      list.push({ field: searchField, operator: "eq", value: state.debouncedQ });
    }
    for (const [field, value] of Object.entries(state.settledFilters)) {
      if (value) list.push({ field, operator: "eq", value });
    }
    return list;
  }, [state.debouncedQ, state.settledFilters, searchField]);

  const { query, result } = useList({
    resource,
    filters: activeFilters,
    pagination: { currentPage: state.page, pageSize },
    queryOptions: { ...freshness, enabled },
  });

  const rows = (result?.data ?? []) as TRow[];
  const total = (result?.total ?? 0) as number;

  return {
    q: state.q,
    setQ: state.setQ,
    debouncedQ: state.debouncedQ,
    filter: state.filter,
    setFilter: state.setFilter,
    page: state.page,
    setPage: state.setPage,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    total,
    rows,
    data: result,
    query: narrowQuery(query),
    denied: isDenied(query.error),
  };
}

/**
 * The same state for an endpoint that does not speak the refine `useList`
 * envelope — session-settlements returns `{ settlements, meta }`, the deletion
 * queue returns `{ data, total, pendingCount }`. `select` is the one place
 * that knows the shape; everything downstream sees rows and a total.
 */
export function useCustomListScreen<TRow>({
  url,
  pageSize = 25,
  searchParam = "q",
  textFilters = [],
  initialFilters,
  paginated = true,
  select,
  extraQuery,
  enabled = true,
  freshness,
}: {
  url: string;
  pageSize?: number;
  searchParam?: string;
  textFilters?: readonly string[];
  initialFilters?: Record<string, string | null>;
  /**
   * False for an endpoint that returns the whole set. It then sends no
   * page/limit — params those routes ignore, which would read as pagination
   * the screen does not actually have — and the footer never appears.
   */
  paginated?: boolean;
  select: (data: unknown) => { rows: TRow[]; total: number };
  extraQuery?: Record<string, string>;
  enabled?: boolean;
  freshness?: Freshness;
}): ListScreen<TRow> {
  const state = useListState(textFilters, initialFilters);

  const query: Record<string, string> = {
    ...(paginated ? { page: String(state.page), limit: String(pageSize) } : {}),
    ...extraQuery,
  };
  if (state.debouncedQ.trim()) query[searchParam] = state.debouncedQ.trim();
  for (const [field, value] of Object.entries(state.settledFilters)) {
    if (value && value.trim()) query[field] = value.trim();
  }

  const req = useCustom({
    url,
    method: "get",
    config: { query },
    queryOptions: { ...freshness, enabled },
  });
  const { rows, total } = select(req.result?.data);

  return {
    q: state.q,
    setQ: state.setQ,
    debouncedQ: state.debouncedQ,
    filter: state.filter,
    setFilter: state.setFilter,
    page: state.page,
    setPage: state.setPage,
    pageSize,
    pageCount: paginated ? Math.max(1, Math.ceil(total / pageSize)) : 1,
    total,
    rows,
    data: req.result?.data,
    query: narrowQuery(req.query),
    denied: isDenied(req.query.error),
  };
}

export type CursorListScreen<TRow> = ListScreen<TRow> & {
  /** There is another page past what is already on screen. */
  hasMore: boolean;
  loadMore: () => void;
};

/**
 * A list the operator extends downward rather than pages through — the user
 * directory, whose endpoint hands back a `nextCursor` instead of a total.
 *
 * Rows accumulate across fetches and are de-duplicated by id: a row created
 * between two fetches shifts the window, and without the dedup the same
 * person would appear twice. Changing the search or any filter drops the
 * accumulation and starts again from the top, which is the only correct
 * answer — appending results for a different query to results for the old one
 * would show a list that matches neither.
 */
export function useCursorListScreen<TRow extends { id: string }>({
  url,
  take = 25,
  searchParam = "q",
  textFilters = [],
  initialFilters,
  select,
  enabled = true,
  freshness,
}: {
  url: string;
  take?: number;
  searchParam?: string;
  textFilters?: readonly string[];
  initialFilters?: Record<string, string | null>;
  select: (data: unknown) => { rows: TRow[]; nextCursor: string | null };
  enabled?: boolean;
  freshness?: Freshness;
}): CursorListScreen<TRow> {
  const state = useListState(textFilters, initialFilters);
  const [cursor, setCursor] = useState<string | null>(null);
  const [rows, setRows] = useState<TRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const query: Record<string, string> = { take: String(take) };
  if (state.debouncedQ) query[searchParam] = state.debouncedQ;
  for (const [field, value] of Object.entries(state.settledFilters)) {
    if (value) query[field] = value;
  }
  const filterKey = JSON.stringify(query);
  if (cursor) query.cursor = cursor;

  useEffect(() => {
    setCursor(null);
    setRows([]);
    setNextCursor(null);
  }, [filterKey]);

  const req = useCustom({
    url,
    method: "get",
    config: { query },
    queryOptions: { ...freshness, enabled },
  });
  const payload = req.result?.data;

  useEffect(() => {
    if (payload === undefined) return;
    const page = select(payload);
    setNextCursor(page.nextCursor);
    setRows((prev) => {
      if (!cursor) return page.rows;
      const seen = new Set(prev.map((r) => r.id));
      return [...prev, ...page.rows.filter((r) => !seen.has(r.id))];
    });
    // `select` is redefined every render by the caller; the payload and the
    // cursor are what actually decide this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, cursor]);

  return {
    q: state.q,
    setQ: state.setQ,
    debouncedQ: state.debouncedQ,
    filter: state.filter,
    setFilter: state.setFilter,
    page: 1,
    setPage: () => {},
    pageSize: take,
    // No total to divide, and one "page" as far as the shared footer is
    // concerned — the load-more control is the pagination here.
    pageCount: 1,
    total: rows.length,
    rows,
    data: payload,
    query: narrowQuery(req.query),
    denied: isDenied(req.query.error),
    hasMore: nextCursor !== null,
    loadMore: () => setCursor(nextCursor),
  };
}
