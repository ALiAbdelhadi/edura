"use client";

import { useCustom } from "@refinedev/core";
import { asData } from "@/lib/refine/as-record";

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
    // `as T | undefined` was a lie: refine hands back a frozen `{}`, never
    // undefined, so every `if (!data)` written against this hook is dead code.
    // asData makes the declared type true. It is the shape-agnostic variant
    // deliberately — this hook is typed `<DeletionRow[]>` at some call sites
    // and `<{ rooms: RoomRow[] }>` at others, and asRecord would turn every
    // successful LIST response into `undefined`, i.e. a permanently empty tab.
    data: asData<T>(req.result?.data),
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
