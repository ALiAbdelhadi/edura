import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

import { getSessionUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors/classes";
import { ReceiptSheet } from "@/features/receipts/receipt-sheet";
import { buildReceiptDocument } from "@repo/server-core/services/payments/receipt-document";
import type { Locale } from "@repo/ui/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // A receipt is somebody's payment record. It must never reach an index.
  robots: { index: false, follow: false },
};

/**
 * The printable receipt. Lives OUTSIDE /dashboard on purpose — a document that
 * gets saved as a PDF should not carry a sidebar, a bottom bar or a portal
 * chrome into the print, and stripping those with print CSS is the fragile way
 * round.
 *
 * Authorization is `buildReceiptDocument` → `getPayment`, the same gate the
 * JSON endpoint uses. A payment somebody may not see raises ForbiddenError,
 * which becomes a 404 here rather than a 403: telling a stranger that receipt
 * PAY-2026-0431 exists but is not theirs is itself a disclosure.
 */
export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; paymentId: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { locale, paymentId } = await params;
  const { print } = await searchParams;

  const user = await getSessionUser();
  if (!user) {
    redirect(`/${locale}/login?callbackUrl=/${locale}/receipts/${paymentId}`);
  }

  const t = await getTranslations({ locale: locale as "ar" | "en", namespace: "receipt" });

  let doc;
  try {
    doc = await buildReceiptDocument(paymentId, user);
  } catch (err) {
    // Not-found and not-yours collapse to the same answer, deliberately.
    if (err instanceof AppError) notFound();
    throw err;
  }

  // The subscription engine writes its note in one machine shape —
  // "Subscription (per_session, cash)" — which landed verbatim (in English) on
  // Arabic receipts. The stored value stays untouched; only the DISPLAY
  // translates it, and a note that is not that exact shape passes through as-is.
  const noteMatch = doc.note?.match(
    /^Subscription \((monthly|per_session), (cash|online)(, paid by parent)?\)$/,
  );
  if (noteMatch) {
    const plan = t(noteMatch[1] === "monthly" ? "notePlanMonthly" : "notePlanPerSession");
    const method = t(noteMatch[2] === "cash" ? "noteMethodCash" : "noteMethodOnline");
    doc = {
      ...doc,
      note: t(noteMatch[3] ? "notePaidByParent" : "noteSubscription", { plan, method }),
    };
  }

  return (
    <ReceiptSheet
      doc={doc}
      locale={locale as Locale}
      autoPrint={print === "1"}
      labels={{
        receiptTitle: t("receiptTitle"),
        refundTitle: t("refundTitle"),
        receiptNo: t("receiptNo"),
        date: t("date"),
        student: t("student"),
        studentCode: t("studentCode"),
        payer: t("payer"),
        course: t("course"),
        issuer: t("issuer"),
        recordedBy: t("recordedBy"),
        total: t("total"),
        refunded: t("refunded"),
        paid: t("paid"),
        note: t("note"),
        systemGenerated: t("systemGenerated"),
        print: t("print"),
      }}
    />
  );
}
