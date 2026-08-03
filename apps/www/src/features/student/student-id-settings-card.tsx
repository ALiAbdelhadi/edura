"use client";

import { useCustom } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { SectionHead, SkeletonRows } from "@repo/ui/components/ledger";
import { DirectionalIcon } from "@repo/ui/components/directional-icon";
import { Link } from "@/i18n/navigation";
import type {
  ProfileChecklist,
  StudentCard,
} from "@repo/server-core/services/students/student-card";
import { StudentIdCard } from "./student-id-card";

/**
 * The card on the account screen.
 *
 * This is where the request actually pointed — "the ID shows up on their
 * account page" — so the card itself is here, not a link to it. The full
 * screen behind the button adds the exports and the checklist.
 *
 * Renders nothing at all while loading fails or the code is still pending: an
 * account screen is not the place to explain onboarding, and the dashboard
 * already carries that notice.
 */
export function StudentIdSettingsCard() {
  const t = useTranslations("studentIdCard");
  const locale = useLocale();
  const { query, result } = useCustom<{ card: StudentCard; checklist: ProfileChecklist }>({
    url: "me/student-card",
    method: "get",
  });

  if (query.isLoading) return <SkeletonRows rows={3} />;
  const card = result?.data?.card;
  if (!card || card.isPending) return null;

  return (
    <section className="flex flex-col gap-3">
      <SectionHead title={t("title")} />
      <StudentIdCard
        card={card}
        locale={locale}
        labels={{ cardTitle: t("cardTitle"), codeLabel: t("codeLabel") }}
      />
      <div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/student/id">
            <DirectionalIcon icon={ArrowRight} className="size-4" aria-hidden="true" />
            {t("openCard")}
          </Link>
        </Button>
      </div>
    </section>
  );
}
