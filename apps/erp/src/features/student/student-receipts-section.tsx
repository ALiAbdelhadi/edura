"use client";

import { useCustom } from "@refinedev/core";
import { useTranslations } from "next-intl";

import { useFormatters } from "@/lib/i18n/use-formatters";
import { ReceiptLink } from "@/features/receipts/receipt-link";
import {
  DateText,
  Hairline,
  LedgerEmpty,
  LedgerTable,
  Money,
  Num,
  SectionHeading,
  Sheet,
  Td,
  Th,
  Tr,
} from "@/features/student/ledger";
import { PageSpinner } from "@/components/kit/spinner";
import { asArray } from "@/lib/refine/as-array";

type PaymentRow = {
  id: string;
  amount: number;
  paidAt: string;
  receiptNumber: string;
  courseName?: string;
};

export function StudentReceiptsSection({ embedded = false }: { embedded?: boolean } = {}) {
  const t = useTranslations();
  const { formatDate } = useFormatters();

  const { query, result } = useCustom({ url: "payments", method: "get" });

  const rows = asArray<PaymentRow>(result?.data).filter((r) => r.receiptNumber);

  const body = query.isLoading ? (
    <PageSpinner />
  ) : rows.length === 0 ? (
    <LedgerEmpty title={t("studentWallet.noReceipts")} hint={t("studentWallet.noReceiptsHint")} />
  ) : (
    <>
      <ul className="sm:hidden">
        {rows.map((r, i) => (
          <li key={r.id}>
            {i > 0 ? <Hairline /> : null}
            <div className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm" style={{ color: "var(--ink)" }}>
                  {formatDate(r.paidAt, { day: "numeric", month: "long", year: "numeric" })}
                </p>
                <Num style={{ color: "var(--ink-3)", fontSize: 11 }}>{r.receiptNumber}</Num>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Money piasters={r.amount} signed />
                <ReceiptLink paymentId={r.id} />
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden sm:block">
        <LedgerTable
          head={
            <>
              <Th>{t("receipt.date")}</Th>
              <Th>{t("receipt.receiptNo")}</Th>
              <Th align="end">{t("studentWallet.colAmount")}</Th>
              <Th align="end">
                <span className="sr-only">{t("receipt.download")}</span>
              </Th>
            </>
          }
        >
          {rows.map((r) => (
            <Tr key={r.id}>
              <Td className="whitespace-nowrap">
                <DateText style={{ color: "var(--ink-2)", fontSize: 12 }}>
                  {formatDate(r.paidAt)}
                </DateText>
              </Td>
              <Td>
                <Num style={{ color: "var(--ink-3)", fontSize: 11 }}>{r.receiptNumber}</Num>
              </Td>
              <Td align="end">
                <Money piasters={r.amount} signed />
              </Td>
              <Td align="end">
                <ReceiptLink paymentId={r.id} />
              </Td>
            </Tr>
          ))}
        </LedgerTable>
      </div>
    </>
  );

  if (embedded) return body;

  return (
    <Sheet className="p-5">
      <SectionHeading title={t("receipt.receiptTitle")} />
      <div className="mt-3">{body}</div>
    </Sheet>
  );
}
