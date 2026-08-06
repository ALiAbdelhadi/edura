import { ReceiptSheet } from "@/features/receipts/receipt-sheet";
import { getSessionUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors/classes";
import { buildReceiptDocument } from "@repo/server-core/services/payments/receipt-document";
import type { Locale } from "@repo/ui/lib/format";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

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
    if (err instanceof AppError) notFound();
    throw err;
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
