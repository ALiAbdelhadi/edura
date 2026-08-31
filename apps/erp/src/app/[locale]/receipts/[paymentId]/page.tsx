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
    redirect(`/${locale}/login?next=/${locale}/receipts/${paymentId}`);
  }

  const t = await getTranslations({ locale: locale as "ar" | "en", namespace: "receipt" });

  let doc;
  try {
    doc = await buildReceiptDocument(paymentId, user);
  } catch (err) {
    if (err instanceof AppError) notFound();
    throw err;
  }

  const methodLabels: Record<string, string> = {
    cash: t("noteMethodCash"),
    online: t("noteMethodOnline"),
    instapay: t("methodInstapay"),
    pos_card: t("methodPosCard"),
    mobile_wallet: t("methodMobileWallet"),
  };
  const noteMatch = doc.note?.match(
    /^Subscription \((monthly|per_session), (cash|online|instapay|pos_card|mobile_wallet)(, paid by parent)?\)$/,
  );
  if (noteMatch) {
    const plan = t(noteMatch[1] === "monthly" ? "notePlanMonthly" : "notePlanPerSession");
    const method = methodLabels[noteMatch[2]] ?? noteMatch[2];
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
        method: t("method"),
        methods: {
          cash: t("noteMethodCash"),
          online_paymob: t("noteMethodOnline"),
          online_fawry: t("noteMethodOnline"),
          wallet: t("methodWalletBalance"),
          instapay: t("methodInstapay"),
          pos_card: t("methodPosCard"),
          mobile_wallet: t("methodMobileWallet"),
        },
      }}
    />
  );
}
