"use client";

import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, IdCard } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { SectionHead, SkeletonRows } from "@repo/ui/components/ledger";
import { DirectionalIcon } from "@repo/ui/components/directional-icon";
import { Link } from "@/i18n/navigation";
import { useOnDemand } from "@/lib/api/use-on-demand";
import type { StudentCard } from "@repo/server-core/services/students/student-card";
import { StudentIdCard } from "@repo/ui/components/student-id-card";

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
