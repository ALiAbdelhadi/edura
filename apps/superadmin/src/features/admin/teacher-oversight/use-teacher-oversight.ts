"use client";

import { useAdminGet } from "@/features/admin/center-oversight/use-oversight";

export { useAdminGet };

/**
 * The teacher twin of `useOversight`. Same contract, different subject — every
 * teacher tab is `GET admin/teachers/:id/oversight/:tab`, so a tab component
 * names the tab and nothing else.
 */
export function useTeacherOversight<T = unknown>(
  teacherId: string,
  tab: string,
  opts: { enabled?: boolean; query?: Record<string, string> } = {},
) {
  return useAdminGet<T>(`admin/teachers/${teacherId}/oversight/${tab}`, opts);
}

export type Paged<T> = { data: T[]; total: number; page: number; limit: number };
