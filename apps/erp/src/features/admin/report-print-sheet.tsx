"use client";

import { useEffect } from "react";

/**
 * Auto-print, opt-in via `?print=1`.
 *
 * Split out as the only client code on the print route so the sheet itself
 * stays a server component: the numbers are rendered on the server from the
 * same report service the CSV uses, and the browser's job is only to lay them
 * out and open the print dialog. That is also what makes the PDF free of any
 * dependency — the browser's own engine shapes Arabic correctly, which is the
 * reason the receipt and the student ID card print this way too.
 */
export function AutoPrint({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    // A frame after paint: printing before the fonts settle produces a sheet
    // with fallback glyphs, which on an Arabic document is unreadable.
    const id = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(id);
  }, [enabled]);
  return null;
}
