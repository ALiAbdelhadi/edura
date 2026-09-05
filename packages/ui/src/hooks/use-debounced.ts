"use client";

import { useEffect, useState } from "react";

/**
 * Trails `value` by `ms` so a search box does not fire one HTTP request and a
 * full re-render per keystroke. 300ms matches the users-screen reference; the
 * global-search palette passes its own 220ms.
 */
export function useDebounced(value: string, ms = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
