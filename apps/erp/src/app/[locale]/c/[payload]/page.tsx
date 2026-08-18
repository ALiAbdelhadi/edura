import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { getSessionUser } from "@/lib/auth/session";
import { ScanResultView } from "@/features/student/scan-result-view";
import { resolveStudentScan } from "@repo/server-core/services/students/student-scan";

// The scan is a live read of one student's credential state: whether the card
// is current is the entire question, and a cached answer is a wrong one the
// moment a card is revoked.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // A card gets dropped, photographed and posted. None of these URLs may ever
  // become a searchable index of children.
  robots: { index: false, follow: false, nocache: true },
};

/* ما بتوديه البطاقة / Where the card leads.
   ══════════════════════════════════════════════════════════════════════════════

   The page the QR opens. Anyone with a phone camera can reach it, which is the
   point — a center needs no scanner app and no special hardware, just the
   camera every receptionist already has — and it is also the constraint that
   shapes everything here.

   WHO IS LOOKING DECIDES WHAT IS SHOWN, and that decision is NOT made in this
   file. `resolveStudentScan` returns an identity already reduced to the
   viewer's tier, so this page renders what it is handed. A page that did its
   own hiding would be a second policy, and the second one is always the one
   that leaks.

   THE COUNTER IS NOT REIMPLEMENTED HERE. A receptionist who scans a card they
   are allowed to act on gets one button, into the existing counter screen with
   the student already resolved. Check-in touches sessions, coverage, cash and
   the ledger; there is exactly one screen that does it, and a second entry
   point drawn on this page would be a second answer to a money question. */
export default async function StudentCardScanPage({
  params,
}: {
  params: Promise<{ locale: string; payload: string }>;
}) {
  const { locale, payload } = await params;

  // No session is required and none is demanded — the tier falls out of
  // whoever happens to be signed in on the device holding the camera.
  const viewer = await getSessionUser();
  const result = await resolveStudentScan(decodeURIComponent(payload), viewer);

  const t = await getTranslations({
    locale: locale as "ar" | "en",
    namespace: "studentCardScan",
  });

  // The two roles that own a counter screen, each in their own portal folder.
  // Resolved here because the role lives here; the view is handed a href, not
  // a role to interpret.
  const counterHref =
    viewer?.role === "center_admin"
      ? "/dashboard/admin/checkin"
      : viewer?.role === "center_staff"
        ? "/dashboard/staff/checkin"
        : null;

  // The hall door, for the two roles that own one. Same shape as the counter
  // above and for the same reason: the role lives here, so the href is
  // resolved here and the view is handed a link rather than a role to read.
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
