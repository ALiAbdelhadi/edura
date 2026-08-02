"use client";

import { useCustom } from "@refinedev/core";
import { useTranslations } from "next-intl";

import { useFormatters } from "@/lib/i18n/use-formatters";
import { ReceiptLink } from "@/features/receipts/receipt-link";
import {
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

type PaymentRow = {
  id: string;
  amount: number;
  paidAt: string;
  receiptNumber: string;
  courseName?: string;
};

/**
 * The student's OWN receipts.
 *
 * The product had payment-history surfaces for the parent and for center staff,
 * and none for the person the receipts are actually about — so a student could
 * not obtain a document for money they paid. This closes that, in the place
 * they already go for their money, rather than inventing a second money screen.
 *
 * `payments` is the SAME endpoint the parent and center screens read; the
 * service scopes a student to `studentId = user.id`, so no new authorization
 * exists here and none was widened.
 *
 * This is deliberately NOT merged into the wallet ledger below it. The wallet
 * ledger is the balance's derivation — every row must sum to the closing
 * figure. Payments made by card or cash never touched the wallet, so folding
 * them in would break the one property that table exists to guarantee.
 */
export function StudentReceiptsSection() {
  const t = useTranslations();
  const { formatDate } = useFormatters();

  const { query, result } = useCustom({ url: "payments", method: "get" });
  const rows = ((result?.data as PaymentRow[] | undefined) ?? []).filter((r) => r.receiptNumber);

  return (
    <Sheet className="p-5">
      <SectionHeading title={t("receipt.receiptTitle")} />

      <div className="mt-3">
        {query.isLoading ? (
          <PageSpinner />
        ) : rows.length === 0 ? (
          <LedgerEmpty title={t("studentWallet.noHistory")} />
        ) : (
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
                  <Num style={{ color: "var(--ink-2)", fontSize: 12 }}>{formatDate(r.paidAt)}</Num>
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
        )}
      </div>
    </Sheet>
  );
}
