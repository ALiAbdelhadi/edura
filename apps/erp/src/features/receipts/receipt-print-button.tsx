"use client";

import { useEffect, useRef } from "react";
import { Printer } from "lucide-react";
import { Button } from "@repo/ui/components/button";

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
      } catch {}
      if (!cancelled) window.print();
    };
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
