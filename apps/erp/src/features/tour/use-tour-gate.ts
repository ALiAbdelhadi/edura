"use client";

/**
 * "Has this person been shown their first-run tour yet?"
 *
 * WHERE IT IS STORED, AND WHY THERE. `user_prefs.tour_completed` already exists
 * with a working `GET/PATCH /api/v1/me/prefs`, so this needs NO migration — and
 * the flag is per USER rather than per browser, so someone who did the tour on
 * their phone is not shown it again on a laptop, which localStorage could not
 * have prevented.
 *
 * IT FAILS CLOSED. If the preference cannot be read, `shouldOpen` stays false
 * and nothing opens. The cost of a missed tour is small; the cost of an overlay
 * ambushing someone on every page load is not.
 *
 * IT MARKS DONE OPTIMISTICALLY. `markDone()` flips local state at once and the
 * PATCH follows; if the write fails the worst case is the tour offering itself
 * one more time, which is better than a spinner between a student and their day.
 *
 * Extracted because two first-run surfaces had begun to need the same three
 * lines of persistence: the student dashboard's guided tour and the assistant's
 * (`features/assistant/assistant-first-run.tsx`). It was shared originally with
 * an overlay that opened the EMULATOR on first run; that overlay is gone,
 * because each role's emulator is now a route of its own under
 * `dashboard/<role>/tour`.
 */

import { useCallback, useEffect, useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";

type PrefsShape = { tourCompleted?: boolean };

export function useTourGate() {
  const { query, result } = useCustom<PrefsShape>({ url: "me/prefs", method: "get" });
  const { mutateAsync: savePrefs } = useCustomMutation();
  const [dismissed, setDismissed] = useState(false);

  /* refine returns a frozen placeholder while a query is idle, so narrow on the
     VALUE rather than trusting the generic — the `exports.find is not a
     function` class of first-paint crash this repo has already paid for once. */
  const payload = (result as { data?: PrefsShape } | undefined)?.data ?? (result as PrefsShape);
  const completed = typeof payload?.tourCompleted === "boolean" ? payload.tourCompleted : null;

  const [shouldOpen, setShouldOpen] = useState(false);
  useEffect(() => {
    if (query.isSuccess && completed === false && !dismissed) setShouldOpen(true);
  }, [query.isSuccess, completed, dismissed]);

  const markDone = useCallback(() => {
    setShouldOpen(false);
    setDismissed(true);
    void savePrefs({ url: "me/prefs", method: "patch", values: { tourCompleted: true } }).catch(
      () => {
        /* May offer itself once more; nothing else breaks. */
      },
    );
  }, [savePrefs]);

  return { shouldOpen, markDone };
}
