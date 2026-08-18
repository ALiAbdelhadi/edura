"use client";

import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, IdCard } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { SectionHead, SkeletonRows } from "@repo/ui/components/ledger";
import { DirectionalIcon } from "@repo/ui/components/directional-icon";
import { Link } from "@/i18n/navigation";
import { useOnDemand } from "@/lib/api/use-on-demand";
import type { StudentCard } from "@repo/server-core/services/students/student-card";
import { StudentIdCard } from "./student-id-card";

/**
 * The card on the account screen.
 *
 * This is where the request originally pointed — "the ID shows up on their
 * account page" — so the card itself is here, not a link to it.
 *
 * ── IT COSTS THE ACCOUNT SCREEN NOTHING UNTIL IT IS PRESSED ────────────────
 *
 * It used to fetch on mount, which meant every visit to Settings — for any
 * reason, to change a password or a phone number — built a card and signed a
 * QR nobody had asked to see. Now the section renders a button and issues NO
 * request at all until the reader wants the card.
 *
 * The completeness gate is NOT re-checked here. `buildStudentCard` refuses an
 * incomplete profile, and the full card screen is the one place equipped to
 * explain WHY and link to each fix; duplicating that explanation on the
 * account screen would be a second copy of a rule that already has an owner.
 * So a refusal here degrades to the one thing that is useful in this context:
 * a link to the screen that can explain it.
 */
export function StudentIdSettingsCard() {
  const t = useTranslations("studentIdCard");
  const locale = useLocale();
  const req = useOnDemand<{ card: StudentCard }>("me/student-card");
  const card = req.data?.card ?? null;

  return (
    <section className="flex flex-col gap-3">
      <SectionHead title={t("title")} />

      {!req.requested ? (
        <>
          <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
            {t("showHint")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={req.request} size="sm">
              <IdCard className="size-4" aria-hidden="true" />
              {t("showCard")}
            </Button>
            <OpenFullScreen label={t("openCard")} />
          </div>
        </>
      ) : req.loading ? (
        <SkeletonRows rows={3} />
      ) : !card || card.isPending ? (
        // Refused, or not issued yet. The account screen is not the place to
        // teach onboarding — it points at the screen that is.
        <>
          <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
            {t("incompleteBody")}
          </p>
          <OpenFullScreen label={t("openCard")} />
        </>
      ) : (
        <>
          <StudentIdCard
            card={card}
            locale={locale}
            labels={{ cardTitle: t("cardTitle"), codeLabel: t("codeLabel") }}
          />
          <OpenFullScreen label={t("openCard")} />
        </>
      )}
    </section>
  );
}

function OpenFullScreen({ label }: { label: string }) {
  return (
    <div>
      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard/student/id">
          <DirectionalIcon icon={ArrowRight} className="size-4" aria-hidden="true" />
          {label}
        </Link>
      </Button>
    </div>
  );
}
