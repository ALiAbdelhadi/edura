import { Eyebrow } from "@repo/ui/components/eyebrow";
import { Num } from "@repo/ui/components/num";
import type { Locale } from "@repo/ui/lib/format";
import type { ReceiptDocument } from "@repo/server-core/services/payments/receipt-document";

import { ReceiptPrintButton } from "./receipt-print-button";

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

          <div className="mt-8 flex items-end justify-between gap-6">
            <span className="pb-1 text-[13px] font-semibold text-ink">
              {isRefund ? labels.refunded : labels.total}
            </span>
            <Num.Total
              piasters={magnitude}
              locale={locale}
              tone={isRefund ? "out" : "in"}
              sign={isRefund}
              className="text-[22px]"
            />
          </div>

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

      <style>{`
        @page { size: A4; margin: 14mm; }
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
            --red: #a81d1d;
            --seal: #8f2727;
          }
          html, body { background: #fff !important; }
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
