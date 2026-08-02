import * as React from "react";
import { formatDateTime, formatEgp, normalizeLocale, type Locale } from "../locale";
import type { PaymentReceiptData } from "../types";
import { Cta, DetailRow, EmailLayout, Note, P } from "./layout";

// =============================================================================
// Payment receipt.
//
// Sent AFTER settlement commits, never inside the transaction — a mail outage
// must not un-settle money. It is a RECORD, not a call to action: there is no
// "pay now" link and no token in it, so a forwarded receipt grants nothing.
//
// The amount is formatted from the piaster integer the ledger holds, through
// the same helper the UI uses, so the email cannot disagree with the screen.
// =============================================================================
const COPY = {
  ar: {
    subject: (n: string) => `إيصال دفع ${n} - Edura`,
    title: "تم استلام الدفعة",
    preview: "إيصال الدفع الخاص بك",
    intro: "شكرًا لك. هذه تفاصيل الدفعة التي تم استلامها.",
    receiptNo: "رقم الإيصال",
    description: "البيان",
    payee: "مستحقة إلى",
    method: "طريقة الدفع",
    paidAt: "تاريخ الدفع",
    amount: "المبلغ",
    cta: "عرض في التطبيق",
    keep: "احتفظ بهذا الإيصال. هذه رسالة تأكيد فقط — لا تحتاج إلى أي إجراء منك.",
    methods: { card: "بطاقة", wallet: "المحفظة", cash: "نقدًا" },
  },
  en: {
    subject: (n: string) => `Payment receipt ${n} - Edura`,
    title: "Payment received",
    preview: "Your payment receipt",
    intro: "Thank you. Here are the details of the payment we received.",
    receiptNo: "Receipt no.",
    description: "Description",
    payee: "Paid to",
    method: "Method",
    paidAt: "Paid at",
    amount: "Amount",
    cta: "View in app",
    keep: "Keep this receipt. This is a confirmation only — no action is needed.",
    methods: { card: "Card", wallet: "Wallet", cash: "Cash" },
  },
} as const;

export function paymentReceiptSubject(locale: Locale, data: PaymentReceiptData): string {
  return COPY[locale].subject(data.receiptNumber);
}

export function PaymentReceiptEmail({
  locale: raw,
  data,
}: {
  locale: Locale;
  data: PaymentReceiptData;
}) {
  const locale = normalizeLocale(raw);
  const t = COPY[locale];

  return (
    <EmailLayout locale={locale} title={t.title} preview={t.preview}>
      <P>{t.intro}</P>
      <DetailRow label={t.receiptNo} value={data.receiptNumber} locale={locale} />
      <DetailRow label={t.description} value={data.description} locale={locale} />
      <DetailRow label={t.payee} value={data.payeeName} locale={locale} />
      <DetailRow label={t.method} value={t.methods[data.method]} locale={locale} />
      <DetailRow label={t.paidAt} value={formatDateTime(data.paidAt, locale)} locale={locale} />
      <DetailRow
        label={t.amount}
        value={formatEgp(data.amountPiasters, locale)}
        locale={locale}
        strong
      />
      {data.link ? <Cta label={t.cta} href={data.link} locale={locale} /> : null}
      <Note>{t.keep}</Note>
    </EmailLayout>
  );
}

export function paymentReceiptText(locale: Locale, data: PaymentReceiptData): string {
  const t = COPY[locale];
  return [
    t.title,
    "",
    t.intro,
    "",
    `${t.receiptNo}: ${data.receiptNumber}`,
    `${t.description}: ${data.description}`,
    `${t.payee}: ${data.payeeName}`,
    `${t.method}: ${t.methods[data.method]}`,
    `${t.paidAt}: ${formatDateTime(data.paidAt, locale)}`,
    `${t.amount}: ${formatEgp(data.amountPiasters, locale)}`,
    ...(data.link ? ["", data.link] : []),
    "",
    t.keep,
  ].join("\n");
}
