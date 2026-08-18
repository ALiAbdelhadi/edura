import { StudentIdPrintSheet } from "@/features/student/student-id-print-sheet";
import { getSessionUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors/classes";
import { buildStudentCard } from "@repo/server-core/services/students/student-card";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function StudentIdPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ studentId?: string; print?: string }>;
}) {
  const { locale } = await params;
  const { studentId, print } = await searchParams;

  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login?callbackUrl=/${locale}/student-id/print`);

  const t = await getTranslations({
    locale: locale as "ar" | "en",
    namespace: "studentIdCard",
  });

  let card;
  try {
    card = await buildStudentCard(studentId ?? user.id, user);
  } catch (err) {
    if (err instanceof AppError) notFound();
    throw err;
  }

  if (card.isPending) notFound();

  return (
    <StudentIdPrintSheet
      card={card}
      locale={locale}
      autoPrint={print === "1"}
      labels={{ cardTitle: t("cardTitle"), codeLabel: t("codeLabel") }}
      printLabel={t("print")}
      cutLabel={t("cutHint")}
    />
  );
}
