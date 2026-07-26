"use client";

import { useCustom } from "@refinedev/core";

/** Any GET under the admin API, with the same shape as `useOversight`. */
export function useAdminGet<T = unknown>(
  url: string,
  opts: { enabled?: boolean; query?: Record<string, string> } = {},
) {
  const req = useCustom({
    url,
    method: "get",
    ...(opts.query ? { config: { query: opts.query } } : {}),
    queryOptions: { enabled: opts.enabled ?? true },
  });
  return {
    data: req.result?.data as T | undefined,
    isLoading: req.query.isLoading,
    refetch: () => req.query.refetch(),
  };
}

/**
 * One hook for every oversight tab: same shape, same enabled-gating, so a tab
 * only fetches when it is the visible one. Read-only by construction — there is
 * no mutation helper in this file.
 */
export function useOversight<T = unknown>(
  centerId: string,
  tab: string,
  opts: { enabled?: boolean; query?: Record<string, string> } = {},
) {
  return useAdminGet<T>(`admin/centers/${centerId}/oversight/${tab}`, opts);
}

export type Paged<T> = { data: T[]; total: number; page: number; limit: number };
