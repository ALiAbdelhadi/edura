"use client";

import { useLocale, useTranslations } from "next-intl";
import { Download } from "lucide-react";

/**
 * The receipt affordance, used from every payment-history table.
 *
 * A plain <a> to the receipt route with `?print=1`, opened in a new tab — NOT a
 * fetch-and-blob download. Two reasons:
 *
 * 1. The PDF is produced by the browser's own print engine (see
 *    receipt-sheet.tsx for why: Arabic needs real shaping, and the browser
 *    already contains HarfBuzz). There is no file on the server to stream.
 * 2. Opening in a new tab means the print dialog never interrupts the page the
 *    user was on. Closing the tab afterwards leaves their place untouched.
 *
 * `rel="noopener"` because the receipt route is same-origin but the new context
 * has no business holding a handle on the opener.
 */
export function ReceiptLink({ paymentId, className }: { paymentId: string; className?: string }) {
  const t = useTranslations("receipt");
  const locale = useLocale();

  return (
    <a
      href={`/${locale}/receipts/${paymentId}?print=1`}
      target="_blank"
      rel="noopener"
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-indigo underline-offset-2 hover:underline"
      }
    >
      <Download className="size-3.5" aria-hidden="true" />
      {t("download")}
    </a>
  );
}
