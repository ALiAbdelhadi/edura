"use client";

import { useCallback, useEffect, useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";

type PrefsShape = { tourCompleted?: boolean };

export function useTourGate() {
  const { query, result } = useCustom<PrefsShape>({ url: "me/prefs", method: "get" });
  const { mutateAsync: savePrefs } = useCustomMutation();
  const [dismissed, setDismissed] = useState(false);

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
      },
    );
  }, [savePrefs]);

  return { shouldOpen, markDone };
}
