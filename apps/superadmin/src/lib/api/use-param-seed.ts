"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Seed a screen's own state from a query parameter, EXACTLY ONCE.
 *
 * The global palette hands a record off to the screen that owns it. Where that
 * screen is a list rather than a detail page, the hand-off is a parameter —
 * here `?q=`, seeding the search the palette already ran — and the reader lands
 * on the row instead of on the list with the same search still to do a second
 * time. A deliberate twin of the same helper in `apps/erp`: it is fifteen lines
 * of Next glue, and the alternative is a shared package that both apps' client
 * bundles pull in for one `useEffect`.
 *
 * ── WHY A REF AND NOT A DEPENDENCY ─────────────────────────────────────────
 *
 * It must apply once and then get out of the way. Without the latch, the
 * parameter stays in the URL and every re-render with a new `searchParams`
 * object identity would shove the reader's own edits back to the value they
 * arrived with — they clear the search box and it refills itself. Seeding is a
 * starting POSITION, not a binding.
 *
 * `useSearchParams` rather than reading `location` during render: the value is
 * not available on the server, and initialising state from it would hydrate to
 * a different tree than it rendered.
 */
export function useParamSeed(
  param: string,
  apply: (value: string) => void,
): void {
  const searchParams = useSearchParams();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    const value = searchParams.get(param);
    if (!value) return;
    done.current = true;
    apply(value);
    // `apply` is redefined every render and is not a dependency worth chasing —
    // the latch is what makes this run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, param]);
}
