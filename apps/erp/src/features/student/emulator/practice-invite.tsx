"use client";

/**
 * The invitation to the emulator, shown on the student dashboard.
 *
 * WHEN IT SHOWS, AND WHY THERE IS NO DISMISS BUTTON: it appears only while the
 * account is EMPTY — no upcoming lesson and nothing in the record. That is the
 * same condition that makes the dashboard itself unhelpful, so the card fills
 * a screen that would otherwise be three empty states, and it disappears by
 * itself the moment the student has a real lesson.
 *
 * "Has data" is the honest definition of "no longer new", so no dismissal flag
 * is stored and nothing has to be remembered per device. A student who wants
 * it back finds it in the menu, where it lives permanently.
 */

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { Eyebrow, LedgerButton, Sheet } from "@/components/ledger";

export function PracticeInvite({ show }: { show: boolean }) {
  const t = useTranslations("studentEmulator");
  if (!show) return null;

  return (
    <Sheet className="p-5" style={{ borderColor: "var(--indigo)" }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <p className="mt-1 text-lg font-semibold" style={{ color: "var(--ink)" }}>
            {t("invite.title")}
          </p>
          <p className="mt-1 max-w-xl text-sm" style={{ color: "var(--ink-2)" }}>
            {t("invite.body")}
          </p>
        </div>
        <LedgerButton variant="primary" asChild>
          <Link href="/dashboard/student/practice">
            <Sparkles className="size-4" aria-hidden />
            {t("invite.cta")}
          </Link>
        </LedgerButton>
      </div>
    </Sheet>
  );
}
