"use client";

import { useCallback, useRef, useState } from "react";
import { useCustom } from "@refinedev/core";
import type { BaseRecord } from "@refinedev/core";

export type OnDemand<T> = {
  request: () => void;
  requested: boolean;
  loading: boolean;
  data: T | null;
  error: { statusCode?: number; message?: string } | null;
  refetch: () => void;
};

export function useVisibilityTrigger(request: () => void): (el: HTMLElement | null) => void {
  const done = useRef(false);
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el || done.current) return;
      if (typeof IntersectionObserver === "undefined") {
        done.current = true;
        request();
        return;
      }
      const io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          done.current = true;
          io.disconnect();
          request();
        },
        { rootMargin: "200px" },
      );
      io.observe(el);
    },
    [request],
  );
}

export function useOnDemand<T extends BaseRecord>(
  url: string,
  opts?: { enabled?: boolean; query?: Record<string, unknown> },
): OnDemand<T> {
  const [requested, setRequested] = useState(false);
  const allowed = opts?.enabled ?? true;

  const { query, result } = useCustom<T>({
    url,
    method: "get",
    ...(opts?.query ? { config: { query: opts.query } } : {}),
    queryOptions: {
      enabled: requested && allowed,
      networkMode: "always",
      retry: (count, error) => {
        const status = (error as { statusCode?: number } | null)?.statusCode ?? 0;
        if (status >= 400 && status < 500) return false;
        return count < 2;
      },
    },
  });

  const request = useCallback(() => setRequested(true), []);

  const payload = result?.data;
  const data =
    payload && typeof payload === "object" && Object.keys(payload).length
      ? (payload as unknown as T)
      : null;

  return {
    request,
    requested,
    loading: requested && allowed && query.isPending && !query.isError,
    data,
    error: (query.error as OnDemand<T>["error"]) ?? null,
    refetch: () => {
      if (requested) void query.refetch();
    },
  };
}
