"use client";

import { useCustom } from "@refinedev/core";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";

const DEBOUNCE_MS = 220;

const MIN_LENGTH = 2;

export type GlobalSearchHit = {
  kind: string;
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  href: string;
  masked?: boolean;
};

export type GlobalSearchPayload = {
  q: string;
  groups: { kind: string; hits: GlobalSearchHit[] }[];
  truncated: boolean;
};

export function useDebounced(value: string, ms = DEBOUNCE_MS): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function useGlobalSearch(query: string): {
  loading: boolean;
  groups: { kind: string; hits: GlobalSearchHit[] }[];
  truncated: boolean;
} {
  const locale = useLocale();
  const live = query.trim();
  const debounced = useDebounced(live).trim();
  const enabled = debounced.length >= MIN_LENGTH;

  const { result, query: state } = useCustom<GlobalSearchPayload>({
    url: "search",
    method: "get",
    config: { query: { q: debounced, locale } },
    queryOptions: {
      enabled,
      staleTime: 30_000,
      retry: false,
    },
  });

  const payload = result?.data as Partial<GlobalSearchPayload> | undefined;

  const settled = enabled && !state.isFetching && payload?.q === debounced;

  return {
    loading: live.length >= MIN_LENGTH && (live !== debounced || !settled),
    groups: settled && Array.isArray(payload?.groups) ? payload.groups : [],
    truncated: settled ? Boolean(payload?.truncated) : false,
  };
}
