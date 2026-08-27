"use client";

import { useLocale, useTranslations } from "next-intl";
import { Download } from "lucide-react";

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
