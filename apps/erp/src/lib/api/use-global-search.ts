"use client";

import { useCustom } from "@refinedev/core";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
 * The client half of the global search.
 *
 * This is a search-AS-YOU-TYPE box on a counter machine, so the two things it
 * must not do are (a) fire a request per keystroke and (b) show an answer to a
 * query the reader has already typed past. Both are handled here rather than in
 * @repo/ui, which owns no data layer.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Long enough that a fast typist sends ONE request per word, short enough that
 *  a hunt-and-peck receptionist does not feel it. Measured against the 250ms
 *  the ky client already waits on nothing else. */
const DEBOUNCE_MS = 220;

/** Mirrors `MIN_QUERY_LENGTH` in the kernel. Kept as a literal rather than
 *  imported: this file must not pull a server module into the browser bundle,
 *  and the server refuses below it anyway — this only avoids the round trip. */
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

/**
 * `query` is the LIVE input value; the debounce lives inside.
 *
 * `loading` is deliberately true while the live query is ahead of the answer in
 * hand, not merely while a request is in flight. Without that, the moment
 * between a keystroke and the debounce firing shows the PREVIOUS query's
 * results with no indication they are stale — which reads as the search having
 * finished and found the wrong thing.
 */
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
      // The palette is opened repeatedly during a shift and the same names are
      // typed all day; a short window makes the second search of "محمد" feel
      // instant without ever showing a roster edit from ten minutes ago.
      staleTime: 30_000,
      // A failed search must not retry three times behind a box the reader is
      // still typing into — by the time it succeeds the query has moved on.
      retry: false,
    },
  });

  // `result.data` is the envelope's payload — refine's data provider unwraps
  // `{ data: … }` one level and no further. It is a FROZEN PLACEHOLDER object
  // while the query is idle, never undefined, which is why every read below
  // narrows on the VALUE rather than trusting the generic (the
  // `exports.find is not a function` class of first-paint crash).
  const payload = result?.data as Partial<GlobalSearchPayload> | undefined;

  // The answer in hand must be an answer to the question currently being asked.
  // Echoing `q` back from the server is what makes that checkable — react-query
  // will happily hand over the previous key's data during a transition.
  const settled = enabled && !state.isFetching && payload?.q === debounced;

  return {
    loading: live.length >= MIN_LENGTH && (live !== debounced || !settled),
    groups: settled && Array.isArray(payload?.groups) ? payload.groups : [],
    truncated: settled ? Boolean(payload?.truncated) : false,
  };
}
