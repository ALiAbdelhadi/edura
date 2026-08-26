import { Eyebrow } from "@repo/ui/components/eyebrow";
import { Num } from "@repo/ui/components/num";
import type { Locale } from "@repo/ui/lib/format";
import type { ReceiptDocument } from "@repo/server-core/services/payments/receipt-document";

import { ReceiptPrintButton } from "./receipt-print-button";

/* الإيصال / The receipt — the most literal ledger document in the product.
   ══════════════════════════════════════════════════════════════════════════════

   This is the one screen whose output leaves the product. Somebody prints it, saves
   it as a PDF, and hands it to a parent or an accountant — so it is built as a
   DOCUMENT, not as a card that happens to be printable.

   ── Why the browser renders the PDF, and not a server library ──────────────────

   Arabic is a connected script: rendering it correctly means contextual shaping
   (initial / medial / final / isolated forms), the lam-alef ligature, mark
   positioning, and bidi reordering when Latin codes and Latin-digit figures sit
   inside an Arabic sentence — which, in this product, is every single line.

   `pdf-lib` (already used for the accountant's invoice) does NONE of that. It maps
   codepoints to glyphs one-to-one, which is why that invoice is English-only. Making
   it render Arabic would mean bolting a reshaper onto it and hand-reversing runs —
   the exact approach that produces receipts with detached letters and amounts on the
   wrong side of a dash, and it fails silently, on somebody's printout, after we have
   stopped looking.

   The browser already contains HarfBuzz. So the receipt is HTML in the Ledger design
   system, and the PDF is produced by the browser's own print engine — correct
   shaping by construction, on every platform, with no dependency and no headless
   Chromium in the deployment. "Save as PDF" is a first-class destination in the
   print dialog on desktop, iOS and Android alike.

   ── What the document must not do ─────────────────────────────────────────────

   - IT STATES NO PAYMENT METHOD. `payments` carries no FK to its `transactions`
     row, so the method could only be guessed by matching amount and time. See the
     header of receipt-document.ts: a receipt is evidence, and a guessed fact on it
     is worse than an absent one.
   - IT NEVER RENDERS AN AMOUNT AS INPUT-SHAPED. Money is append-only; a receipt is
     the most permanent thing the product prints.
   - THE SEAL DOES NOT MIRROR IN RTL (constitution §6.4). It is a stamp pressed
     askew, and a stamp does not mirror when you turn the page around.
   - PRINT FORCES THE PAPER PALETTE. The tokens flip in dark mode; a receipt printed
     from a dark-themed session must not come out as white ink on nothing. The
     @media print block below pins the light values and sets print-color-adjust so
     the seal and the rules survive the printer's "background graphics" default. */

/**
 * The receipt's date, built by hand — and that is a BIDI decision, not a
 * styling preference. Both `Intl` shapes are wrong here under `ar`, measured
 * in the browser rather than theorised:
 *
 *   {day, month:"short", year}  → "02 أغسطس 2026" is ONE string mixing Latin
 *     digits with an Arabic run. UAX #9 rule W2 reclassifies the trailing
 *     "2026" as an ARABIC NUMBER (its last strong type is Arabic), which sorts
 *     it left of the month: rendered 02 (x=410), 2026 (x=433), أغسطس (x=472).
 *
 *   {day, month:"2-digit", year} → `ar-EG` emits U+200F RIGHT-TO-LEFT MARKs
 *     between the parts. Inside the LTR isolate those flip the segments and
 *     the date renders "022026/08/".
 *
 * A hand-built string contains one script, no separators the algorithm may
 * reorder, and no invisible control characters — so there is nothing left for
 * bidi to get wrong. Dates are data (constitution §6.3), so it stays mono,
 * Latin-digit and isolated, which `<Num.Code>` provides.
 *
 * KNOWN, STILL OPEN — for whoever owns `@repo/ui`: `<Num.Date>` reproduces the
 * first failure on every screen that renders an Arabic long date. That is a
 * shared-component fix and is deliberately NOT made here, because changing it
 * would silently re-render every date in both apps; it needs its own pass with
 * its own proof.
 */
function receiptDate(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

type Labels = {
  receiptTitle: string;
  refundTitle: string;
  receiptNo: string;
  date: string;
  student: string;
  studentCode: string;
  payer: string;
  course: string;
  issuer: string;
  recordedBy: string;
  total: string;
  refunded: string;
  paid: string;
  note: string;
  systemGenerated: string;
  print: string;
  /** Phase 1: the payment-method row. `methods` maps enum value -> label; a
   *  method with no label (or a NULL method — an `unknown` row) renders no
   *  row at all: an admitted gap, never a guess. */
  method: string;
  methods: Record<string, string>;
};

export function ReceiptSheet({
  doc,
  locale,
  labels,
  autoPrint,
}: {
  doc: ReceiptDocument;
  locale: Locale;
  labels: Labels;
  autoPrint: boolean;
}) {
  const isRefund = doc.isRefund;
  const magnitude = Math.abs(doc.amount);

  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: labels.date,
      value: <Num.Code className="text-ink">{receiptDate(doc.paidAt)}</Num.Code>,
    },
    {
      label: labels.student,
      value: <span className="font-medium text-ink">{doc.student.name || "—"}</span>,
    },
  ];

  if (doc.student.code) {
    rows.push({ label: labels.studentCode, value: <Num.Code>{doc.student.code}</Num.Code> });
  }
  // Only shown when somebody OTHER than the student paid — a receipt that says
  // "payer: the student" on every row teaches the reader to stop looking at it.
  if (doc.payer) {
    rows.push({
      label: labels.payer,
      value: <span className="font-medium text-ink">{doc.payer.name}</span>,
    });
  }
  if (doc.course) {
    rows.push({ label: labels.course, value: <span className="text-ink">{doc.course.title}</span> });
  }
  if (doc.paymentMethod && labels.methods[doc.paymentMethod]) {
    rows.push({
      label: labels.method,
      value: <span className="text-ink">{labels.methods[doc.paymentMethod]}</span>,
    });
  }
  rows.push({
    label: labels.issuer,
    value: <span className="text-ink">{doc.issuer.name || "—"}</span>,
  });

  return (
    <div className="receipt-page min-h-dvh bg-paper px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto flex max-w-[210mm] flex-col gap-4">
        <div className="flex justify-end print:hidden">
          <ReceiptPrintButton label={labels.print} autoPrint={autoPrint} />
        </div>

        {/* THE SHEET. A4 width, hairline rules, nothing that looks editable. */}
        <article className="receipt-sheet relative overflow-hidden rounded-xl border border-rule bg-sheet px-8 py-8 shadow-[var(--lift)] print:rounded-none print:border-0 print:px-0 print:shadow-none sm:px-12 sm:py-10">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-5">
            <div>
              <p className="text-[22px] font-semibold text-indigo">Edura</p>
              <p className="mt-0.5 text-[13px] text-ink-2">{doc.issuer.name}</p>
            </div>
            <div className="text-end">
              <Eyebrow locale={locale}>{isRefund ? labels.refundTitle : labels.receiptTitle}</Eyebrow>
              <Num.Code className="mt-1 block text-[15px] font-semibold text-ink">
                {doc.receiptNumber}
              </Num.Code>
            </div>
          </header>

          <dl className="mt-6 grid grid-cols-1 gap-x-10 gap-y-3 sm:grid-cols-2">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-4 border-b border-rule-2 pb-2"
              >
                <dt className="shrink-0 text-[12px] text-ink-2">{row.label}</dt>
                <dd className="min-w-0 text-end text-[13px]">{row.value}</dd>
              </div>
            ))}
          </dl>

          {doc.note ? (
            <p className="mt-5 text-[12px] leading-relaxed text-ink-2">
              <span className="text-ink-3">{labels.note}: </span>
              {doc.note}
            </p>
          ) : null}

          {/* THE CONCLUSION. Double rule — this line is a total, not another row. */}
          <div className="mt-8 flex items-end justify-between gap-6">
            <span className="pb-1 text-[13px] font-semibold text-ink">
              {isRefund ? labels.refunded : labels.total}
            </span>
            {/* The sign is shown ONLY on a refund. On a payment receipt a
                leading "+" is noise — the document's own title already says
                which direction the money went, and a total nobody can read as
                ambiguous does not need a sign to disambiguate it. On a refund
                the "−" is load-bearing and stays. */}
            <Num.Total
              piasters={magnitude}
              locale={locale}
              tone={isRefund ? "out" : "in"}
              sign={isRefund}
              className="text-[22px]"
            />
          </div>

          {/* The seal. One animation in the product, and it does not mirror. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-10 select-none end-10 print:bottom-6 print:end-4"
          >
            <span className="receipt-seal inline-block rotate-[-6deg] rounded-[6px] border-2 border-current px-3 py-1 text-[13px] font-bold uppercase tracking-[0.14em] text-seal">
              {isRefund ? labels.refundTitle : labels.paid}
            </span>
          </div>

          <footer className="mt-10 border-t border-rule pt-4 text-[11px] text-ink-3">
            {doc.recordedBy ? (
              <p>
                {labels.recordedBy}: <span className="text-ink-2">{doc.recordedBy.name}</span>
              </p>
            ) : null}
            <p className="mt-1">{labels.systemGenerated}</p>
          </footer>
        </article>
      </div>

      {/* Print rules live with the document rather than in globals.css, which is
          shared with two other workstreams this cycle. */}
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          /* The tokens flip in dark mode. A receipt does not. */
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
            --red: #a81d1d;
            --seal: #8f2727;
          }
          html, body { background: #fff !important; }
          /* Browsers drop backgrounds and borders-as-colour by default; the seal
             and the hairline rules are the document's evidence of type, so they
             must survive. */
          .receipt-page, .receipt-page * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .receipt-sheet { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
