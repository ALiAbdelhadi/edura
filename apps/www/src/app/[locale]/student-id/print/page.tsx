import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

import { getSessionUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors/classes";
import { buildStudentCard } from "@repo/server-core/services/students/student-card";
import { StudentIdPrintSheet } from "@/features/student/student-id-print-sheet";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // A child's ID card. It must never reach an index.
  robots: { index: false, follow: false },
};

/**
 * The printable student card. Outside /dashboard on purpose — see the header of
 * student-id-print-sheet.tsx.
 *
 * Authorization is `buildStudentCard`, the same gate the JSON endpoint uses, so
 * a parent reaches their approved child's card here and nobody reaches anyone
 * else's. A card that is not yours collapses to a 404 rather than a 403: telling
 * a stranger that a given student exists is itself a disclosure.
 */
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

  // A pending code is going to change when onboarding finishes. Printing one
  // would hand a student a card that stops matching their own record.
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
