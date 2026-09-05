"use client";

import { useCustom } from "@refinedev/core";
import { useDebounced } from "@repo/ui/hooks/use-debounced";
import { useLocale } from "next-intl";

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

// One hook for both palettes. The two app copies had drifted apart -- the ERP
// passed `locale` (its search route localises titles), the back office added
// `failed` (so a dead endpoint reads as an error, not as "no results"). Both
// routes tolerate `locale`, and `failed` is simply unused where nobody reads it.
export function useGlobalSearch(query: string): {
  loading: boolean;
  failed: boolean;
  groups: { kind: string; hits: GlobalSearchHit[] }[];
  truncated: boolean;
} {
  const locale = useLocale();
  const live = query.trim();
  const debounced = useDebounced(live, DEBOUNCE_MS).trim();
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

  const failed = enabled && !state.isFetching && state.isError;
  const settled =
    enabled && !state.isFetching && (payload?.q === debounced || failed);

  return {
    loading: live.length >= MIN_LENGTH && (live !== debounced || !settled),
    failed: live === debounced && failed,
    groups: settled && !failed && Array.isArray(payload?.groups) ? payload.groups : [],
    truncated: settled && !failed ? Boolean(payload?.truncated) : false,
  };
}
