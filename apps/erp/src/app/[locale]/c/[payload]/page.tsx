import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { getSessionUser } from "@/lib/auth/session";
import { ScanResultView } from "@/features/student/scan-result-view";
import { resolveStudentScan } from "@repo/server-core/services/students/student-scan";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function StudentCardScanPage({
  params,
}: {
  params: Promise<{ locale: string; payload: string }>;
}) {
  const { locale, payload } = await params;

  const viewer = await getSessionUser();
  const result = await resolveStudentScan(decodeURIComponent(payload), viewer);

  const t = await getTranslations({
    locale: locale as "ar" | "en",
    namespace: "studentCardScan",
  });

  const counterHref =
    viewer?.role === "center_admin"
      ? "/dashboard/admin/checkin"
      : viewer?.role === "center_staff"
        ? "/dashboard/staff/checkin"
        : null;

  const doorHref =
    viewer?.role === "teacher"
      ? "/dashboard/teacher/door"
      : viewer?.role === "assistant"
        ? "/dashboard/assistant/door"
        : null;

  return (
    <ScanResultView
      result={result}
      locale={locale}
      counterHref={counterHref}
      doorHref={doorHref}
      labels={{
        eyebrow: t("eyebrow"),
        validTitle: t("valid.title"),
        validBody: t("valid.body"),
        revokedTitle: t("revoked.title"),
        revokedBody: t("revoked.body"),
        revokedReason: t("revoked.reason"),
        supersededTitle: t("superseded.title"),
        supersededBody: t("superseded.body"),
        invalidTitle: t("invalid.title"),
        invalidBody: t("invalid.body"),
        unreadableTitle: t("unreadable.title"),
        unreadableBody: t("unreadable.body"),
        codeLabel: t("codeLabel"),
        systemLabel: t("systemLabel"),
        gradeLabel: t("gradeLabel"),
        trackLabel: t("trackLabel"),
        publicNotice: t("publicNotice"),
        signInCta: t("signInCta"),
        counterCta: t("counterCta"),
        doorCta: t("doorCta"),
        doorHint: t("doorHint"),
        notOnRoster: t("notOnRoster"),
        foundCard: t("foundCard"),
      }}
    />
  );
}
