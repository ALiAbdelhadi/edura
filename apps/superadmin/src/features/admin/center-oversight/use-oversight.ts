"use client";

import { useCustom } from "@refinedev/core";
import { asData } from "@/lib/refine/as-record";

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
    data: asData<T>(req.result?.data),
    isLoading: req.query.isLoading,
    isError: req.query.isError,
    error: req.query.error,
    refetch: () => req.query.refetch(),
  };
}

export function useOversight<T = unknown>(
  centerId: string,
  tab: string,
  opts: { enabled?: boolean; query?: Record<string, string> } = {},
) {
  return useAdminGet<T>(`admin/centers/${centerId}/oversight/${tab}`, opts);
}

export type Paged<T> = { data: T[]; total: number; page: number; limit: number };
