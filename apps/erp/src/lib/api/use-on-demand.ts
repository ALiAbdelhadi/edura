"use client";

import { useCallback, useRef, useState } from "react";
import { useCustom } from "@refinedev/core";
import type { BaseRecord } from "@refinedev/core";

// ===========================================================================
// عند الطلب — DATA THAT IS NOT FETCHED UNTIL SOMEONE ASKS FOR IT.
//
// The rule this encodes (Ali, 2026-08-09): a screen must not spend a database
// query on something the reader has not asked to see.
//
// ── AND THE BOUNDARY, WHICH MATTERS AS MUCH AS THE RULE ────────────────────
//
// This is for SECONDARY data — a panel below the fold, an expensive report, a
// list the reader may never scroll to, a read that writes an audit row. It is
// NOT for the thing the page exists for. Putting a wallet balance behind a
// button does not save a query, it moves it behind an extra round-trip and a
// click, and the screen reads as broken while the reader wonders what to press.
// The test is simple: if a reader would be confused to arrive and NOT see it,
// it loads with the page.
//
// ── WHY A HOOK AND NOT `queryOptions: { enabled }` AT EACH CALL SITE ───────
//
// `enabled` alone is a boolean someone has to remember to wire to state, and
// the three states that follow from it — never asked, loading, loaded — get
// re-derived slightly differently at every call site. refine also hands back a
// frozen placeholder object while a query is idle, so `result.data` is `{}`
// rather than undefined; every call site that trusted its generic instead of
// narrowing on the value has been a bug in this codebase before (the
// `exports.find is not a function` first-paint crash). This resolves both once.
// ===========================================================================

export type OnDemand<T> = {
  /** Ask for it. Idempotent — pressing twice does not fetch twice. */
  request: () => void;
  /** True once `request()` has been called. Drives the button → panel swap. */
  requested: boolean;
  /** In flight. False before the first request, so a button is not a spinner. */
  loading: boolean;
  /** Narrowed on the VALUE, never on the generic. `null` until it lands. */
  data: T | null;
  error: { statusCode?: number; message?: string } | null;
  /** Re-run after a mutation. A no-op before the first request. */
  refetch: () => void;
};

/**
 * The OTHER way a reader asks for something: by scrolling to it.
 *
 * A button is right when the data is a discrete thing you go and get — a card,
 * an export history, a filter's option list. It is WRONG for a chart on a
 * reports page: someone who opened "Reports" has already asked for the
 * reports, and making them press five buttons is not restraint, it is a worse
 * screen. What they have not asked for is the chart three scrolls down that
 * they may never reach.
 *
 * So: same rule ("no query for something nobody asked to see"), read off the
 * viewport instead of a click. `rootMargin` fires it slightly BEFORE the
 * section arrives, so the data is usually there by the time it is looked at
 * and the deferral is invisible.
 *
 * Returns a ref to put on the section. Fires exactly once.
 */
export function useVisibilityTrigger(request: () => void): (el: HTMLElement | null) => void {
  const done = useRef(false);
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el || done.current) return;
      // No IntersectionObserver (very old browsers, and jsdom in unit tests):
      // fall back to asking immediately. Degrading to the OLD behaviour is the
      // safe direction — the failure mode is a screen that loads eagerly, not
      // a screen that never loads.
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
  // `opts.enabled` is a PRECONDITION, not the trigger: a caller uses it to say
  // "this is not askable yet" (no id resolved, profile incomplete). The trigger
  // is always the reader.
  const allowed = opts?.enabled ?? true;

  const { query, result } = useCustom<T>({
    url,
    method: "get",
    // Filters/date ranges ride here. refine keys the cache on them, so changing
    // a filter refetches — but only for a panel that has already been asked
    // for, which is the whole point.
    ...(opts?.query ? { config: { query: opts.query } } : {}),
    queryOptions: {
      enabled: requested && allowed,
      // A 4xx here is an ANSWER — "not yours", "not complete yet" — not a
      // transport failure. Under React Query's defaults it would be retried and
      // then PAUSED with no error ever surfacing, which is how a screen ends up
      // rendering a blank rectangle it cannot explain.
      networkMode: "always",
      retry: (count, error) => {
        const status = (error as { statusCode?: number } | null)?.statusCode ?? 0;
        if (status >= 400 && status < 500) return false;
        return count < 2;
      },
    },
  });

  const request = useCallback(() => setRequested(true), []);

  // refine returns a frozen placeholder while idle/in-flight, so the presence
  // of the payload is decided on the value.
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
