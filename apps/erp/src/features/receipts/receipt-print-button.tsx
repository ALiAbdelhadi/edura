"use client";

import { useEffect, useRef } from "react";
import { Printer } from "lucide-react";
import { Button } from "@repo/ui/components/button";

/**
 * The only client-side code on the receipt page.
 *
 * `autoPrint` fires once, after paint, when the page was opened from the
 * "download receipt" action in payment history — so the user lands directly in
 * the print dialog, where "Save as PDF" is a destination on every platform we
 * ship to. The ref guard matters: React 19 runs effects twice in development,
 * and two print dialogs is a bug the user would report as "it printed twice".
 *
 * `document.fonts.ready` is awaited before printing. Without it the dialog can
 * capture a paint taken during the font swap, and the Arabic renders in the
 * fallback face — which is precisely the failure this whole approach exists to
 * avoid.
 */
export function ReceiptPrintButton({
  label,
  autoPrint,
}: {
  label: string;
  autoPrint: boolean;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (!autoPrint || fired.current) return;
    fired.current = true;

    let cancelled = false;
    const run = async () => {
      try {
        await document.fonts?.ready;
      } catch {
        // A browser without the Font Loading API still prints; it just may
        // race the swap. Not a reason to withhold the dialog.
      }
      if (!cancelled) window.print();
    };
    // One frame, so the sheet is laid out before the dialog snapshots it.
    const id = requestAnimationFrame(() => void run());
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [autoPrint]);

  return (
    <Button onClick={() => window.print()} size="sm">
      <Printer className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
}
