"use client";

import { useEffect, useRef } from "react";
import { Printer } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { formatStudentCode } from "@repo/database/student-code";
import type { StudentCard } from "@repo/server-core/services/students/student-card";
import { StudentIdCard, type CardLabels } from "./student-id-card";

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
        await document.fonts?.ready;
      } catch {
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
        @page { size: A4; margin: 18mm; }
        .id-print-card { width: 100%; }
        @media print {
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
