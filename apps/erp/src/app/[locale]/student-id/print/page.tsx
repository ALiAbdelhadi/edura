import { StudentIdPrintSheet } from "@/features/student/student-id-print-sheet";
import { serviceGet } from "@/lib/server/service-fetch";
import type { StudentCard } from "@repo/server-core/services/students/student-card";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type StudentCardWire = Omit<StudentCard, "memberSince" | "qr"> & {
  memberSince: string;
  qr: Omit<StudentCard["qr"], "issuedAt" | "revokedAt"> & {
    issuedAt: string | null;
    revokedAt: string | null;
  };
};

function reviveCard(w: StudentCardWire): StudentCard {
  return {
    ...w,
    memberSince: new Date(w.memberSince),
    qr: {
      ...w.qr,
      issuedAt: w.qr.issuedAt ? new Date(w.qr.issuedAt) : null,
      revokedAt: w.qr.revokedAt ? new Date(w.qr.revokedAt) : null,
    },
  };
}

export default async function StudentIdPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ studentId?: string; print?: string }>;
}) {
  const { locale } = await params;
  const { studentId, print } = await searchParams;

  // One read: the route defaults studentId to the session's own id, as the
  // page did. 401 is the signed-out visitor; any other 4xx was an AppError
  // (forbidden, not found) the page turned into notFound().
  const res = await serviceGet<{ card: StudentCardWire }>("/api/v1/me/student-card", { studentId });
  if (res.status === 401) redirect(`/${locale}/login?next=/${locale}/student-id/print`);
  if (!res.data) notFound();

  const t = await getTranslations({
    locale: locale as "ar" | "en",
    namespace: "studentIdCard",
  });

  const card = reviveCard(res.data.card);
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
