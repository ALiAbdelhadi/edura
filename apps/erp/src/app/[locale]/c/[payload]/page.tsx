import { ScanResultView } from "@/features/student/scan-result-view";
import { ServiceError, serviceGet } from "@/lib/server/service-fetch";
import { ssrSession } from "@/lib/server/ssr-session";
import type { StudentScanResult } from "@repo/server-core/services/students/student-scan";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

// The wire form of StudentScanResult: `revokedAt` crosses as an ISO string
// (the view never renders it, but the type is honest about what arrives).
type ScanResultWire =
  | Exclude<StudentScanResult, { outcome: "revoked" }>
  | (Omit<Extract<StudentScanResult, { outcome: "revoked" }>, "revokedAt"> & { revokedAt: string });

function reviveScan(wire: ScanResultWire): StudentScanResult {
  return wire.outcome === "revoked" ? { ...wire, revokedAt: new Date(wire.revokedAt) } : wire;
}

export default async function StudentCardScanPage({
  params,
}: {
  params: Promise<{ locale: string; payload: string }>;
}) {
  const { locale, payload } = await params;

  // The viewer decides the CTA links here; the disclosure tier is decided by
  // the service from the same cookie (session-optional route).
  const scanPath = `/api/v1/students/scan/${encodeURIComponent(decodeURIComponent(payload))}`;
  const [{ user: viewer }, scan] = await Promise.all([ssrSession(), serviceGet<ScanResultWire>(scanPath)]);
  if (!scan.data) throw new ServiceError(scan.status, scanPath);
  const result = reviveScan(scan.data);

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
