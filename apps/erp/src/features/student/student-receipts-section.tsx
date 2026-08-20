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
 * This is deliberately NOT merged into the wallet ledger beside it. The wallet
 * ledger is the balance's derivation — every row must sum to the closing
 * figure. Payments made by card or cash never touched the wallet, so folding
 * them in would break the one property that table exists to guarantee. They are
 * two tabs of one page, never one list.
 *
 * ── `embedded` ────────────────────────────────────────────────────────────
 *
 * The section used to own its own `Sheet` and heading and sit BENEATH the
 * ledger — which, with a hundred entries above it, put a student's proof of
 * payment about four thousand pixels down a phone screen. It is now a tab
 * inside the wallet's own sheet, so it renders bare there. The standalone form
 * is kept because the component is reusable and a caller outside a tab strip
 * still needs its own frame.
 */
export function StudentReceiptsSection({ embedded = false }: { embedded?: boolean } = {}) {
  const t = useTranslations();
  const { formatDate } = useFormatters();

  const { query, result } = useCustom({ url: "payments", method: "get" });

  // `asArray`, not `?? []` — `result.data` is a frozen `{}` until the request
  // resolves, so the old guard let a non-array through and `.filter` threw on
  // the FIRST render, before the isLoading branch below could ever run.
  const rows = asArray<PaymentRow>(result?.data).filter((r) => r.receiptNumber);

  const body = query.isLoading ? (
    <PageSpinner />
  ) : rows.length === 0 ? (
    <LedgerEmpty title={t("studentWallet.noReceipts")} hint={t("studentWallet.noReceiptsHint")} />
  ) : (
    <>
      {/* ── Phone: rows ────────────────────────────────────────────────────
          Four columns of a receipt do not fit a 375px sheet; the amount is the
          first thing to be squeezed out, and the amount is the point. */}
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

      {/* ── From `sm`: the table, which is this product's money idiom. */}
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
