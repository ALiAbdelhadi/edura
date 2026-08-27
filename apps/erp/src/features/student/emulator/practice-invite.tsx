"use client";

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
