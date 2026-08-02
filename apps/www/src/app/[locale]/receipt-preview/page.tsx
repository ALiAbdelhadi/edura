import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ReceiptSheet } from "@/features/receipts/receipt-sheet";
import type { Locale } from "@repo/ui/lib/format";

export const dynamic = "force-dynamic";

/**
 * DEV-ONLY design preview of the receipt document. `notFound()` in production.
 *
 * It exists because of a real constraint, not for convenience: the project's
 * conventions forbid demo data from writing to the money tables, and a receipt
 * cannot be rendered without a `payments` row. So this renders the REAL
 * <ReceiptSheet> against a fabricated document — the same component, the same
 * design system, the same print CSS — with zero Payment, Transaction or ledger
 * rows created.
 *
 * That makes it the only way to review the receipt's Arabic shaping, RTL
 * layout and print output without either seeding money or paying for something
 * in the preview. Delete it the day demo payments are allowed.
 */
export default async function ReceiptPreviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as "ar" | "en", namespace: "receipt" });

  const doc = {
    receiptNumber: "NILE-000472",
    amount: 45000,
    currency: "EGP",
    isRefund: false,
    note: "اشتراك شهري — الرياضيات البحتة، الصف الثالث الثانوي (دفع نقدي بالمركز)",
    paidAt: new Date("2026-08-02T10:15:00Z"),
    student: { id: "s1", name: "عبد الرحمن محمود السيد", code: "STU-000481" },
    payer: { id: "p1", name: "منى عبد الحكيم" },
    issuer: { kind: "center" as const, id: "c1", name: "مركز النيل التعليمي — المعادي" },
    course: { id: "co1", title: "الرياضيات البحتة — الصف الثالث الثانوي" },
    recordedBy: { id: "r1", name: "شيماء فتحي" },
  };

  return (
    <ReceiptSheet
      doc={doc}
      locale={locale as Locale}
      autoPrint={false}
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
