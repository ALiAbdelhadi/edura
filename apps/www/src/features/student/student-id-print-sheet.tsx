"use client";

import { useEffect, useRef } from "react";
import { Printer } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { formatStudentCode } from "@repo/database/student-code";
import type { StudentCard } from "@repo/server-core/services/students/student-card";
import { StudentIdCard, type CardLabels } from "./student-id-card";

/* The printable card.
   ══════════════════════════════════════════════════════════════════════════════

   Lives OUTSIDE /dashboard for the same reason the receipt does: a document that
   gets saved as a PDF must not carry a sidebar, a bottom bar and a portal header
   into the print, and stripping those with print CSS afterwards is the fragile
   way round.

   ── Why the browser makes the PDF ─────────────────────────────────────────────

   The name on this card is Arabic, which means contextual shaping, the lam-alef
   ligature, and bidi reordering around a Latin code sitting inside an Arabic
   line. `pdf-lib` — already in the repo for the accountant's invoice — maps
   codepoints to glyphs one to one and does none of that, which is why that
   invoice is English-only. The browser already contains HarfBuzz, so the card is
   HTML and the PDF comes out of the browser's own print engine: correct on every
   platform, no dependency, no headless Chromium in the deployment. "Save as PDF"
   is a destination in the print dialog on desktop, iOS and Android alike.

   ── Printed at true size ──────────────────────────────────────────────────────

   85.6 × 54 mm — ID-1, the same rectangle as a bank card, so a student who cuts
   it out gets something that fits a wallet rather than a sheet of A4 with a
   picture on it. `@page` margins are set generously so no printer's unprintable
   edge clips the frame. */

export function StudentIdPrintSheet({
  card,
  locale,
  autoPrint,
  labels,
  printLabel,
  cutLabel,
}: {
  card: StudentCard;
  locale: string;
  autoPrint: boolean;
  labels: CardLabels;
  printLabel: string;
  cutLabel: string;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (!autoPrint || fired.current) return;
    fired.current = true;
    let cancelled = false;
    const run = async () => {
      try {
        // Without this the dialog can snapshot a paint taken mid font-swap and
        // the Arabic prints in the fallback face.
        await document.fonts?.ready;
      } catch {
        /* no Font Loading API — print anyway */
      }
      if (!cancelled) window.print();
    };
    const id = requestAnimationFrame(() => void run());
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [autoPrint]);

  return (
    <div className="id-print-page min-h-screen bg-paper p-6 sm:p-10">
      <div className="mx-auto flex max-w-[560px] flex-col gap-5">
        <div className="flex items-center justify-between gap-4 print:hidden">
          <p className="text-sm text-ink-2">{cutLabel}</p>
          <Button onClick={() => window.print()} size="sm">
            <Printer className="size-4" aria-hidden="true" />
            {printLabel}
          </Button>
        </div>

        <div className="id-print-card">
          <StudentIdCard card={card} locale={locale} labels={labels} />
        </div>

        <p className="text-center text-[11px] text-ink-3 print:hidden" dir="ltr">
          {formatStudentCode(card.studentCode)}
        </p>
      </div>

      <style>{`
        /* ID-1: the bank-card rectangle. */
        @page { size: A4; margin: 18mm; }
        .id-print-card { width: 100%; }
        @media print {
          /* The tokens flip in dark mode. A printed card does not. */
          :root, [data-theme="dark"] {
            --paper: #ffffff;
            --sheet: #ffffff;
            --field: #ffffff;
            --ink: #1c2230;
            --ink-2: #5b6273;
            --ink-3: #707686;
            --rule: #d8d5cc;
            --rule-2: #e7e4dc;
            --indigo: #1a2f73;
            --teal: #0a7a6f;
            --amber: #8a5a00;
          }
          html, body { background: #fff !important; }
          /* The engraving, the frame and the QR are the whole point of the
             document; browsers drop backgrounds and colour borders by default. */
          .id-print-page, .id-print-page * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .id-print-card {
            width: 85.6mm;
            margin: 0 auto;
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}
