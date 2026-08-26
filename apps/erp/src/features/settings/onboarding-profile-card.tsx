"use client";

import { DescriptionList } from "@/components/kit/description-list";
import { Spinner } from "@/components/kit/spinner";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { Button } from "@repo/ui/components/button";
import { SectionHead } from "@repo/ui/components/ledger";
import { GraduationCap, Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type StudentState = {
  role: "student";
  onboardingCompleted: boolean;
  educationSystem: { nameAr: string; nameEn: string | null } | null;
  gradeLevel: { nameAr: string; nameEn: string | null } | null;
  track: { nameAr: string; nameEn: string | null } | null;
  secondLanguageSubject: { nameAr: string; nameEn: string | null } | null;
};

type TeacherState = {
  role: "teacher";
  onboardingCompleted: boolean;
  gradeLevelIds: string[];
  subjectIds: string[];
};

type CenterState = {
  role: "center_admin";
  onboardingCompleted: boolean;
  stageIds?: string[];
};

type State = StudentState | TeacherState | CenterState | { role: string };

export function OnboardingProfileCard() {
  const t = useTranslations();
  const locale = useLocale();
  const [state, setState] = useState<State | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .get("me/onboarding")
      .json<{ data: State }>()
      .then((res) => setState(res.data))
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null;

  const dn = (x: { nameAr: string; nameEn: string | null } | null) =>
    !x ? "—" : locale === "en" && x.nameEn ? x.nameEn : x.nameAr;

  const items: { label: string; value: React.ReactNode }[] = [];
  if (state && "educationSystem" in state) {
    const s = state as StudentState;
    items.push(
      { label: t("shared.academicSystem"), value: dn(s.educationSystem) },
      { label: t("shared.academicGrade"), value: dn(s.gradeLevel) },
      { label: t("shared.academicTrack"), value: dn(s.track) },
      { label: t("shared.academicSecondLanguage"), value: dn(s.secondLanguageSubject) },
    );
  } else if (state && "subjectIds" in state) {
    const s = state as TeacherState;
    items.push(
      { label: t("shared.academicGrades"), value: String(s.gradeLevelIds.length) },
      { label: t("shared.academicSubjects"), value: String(s.subjectIds.length) },
    );
  } else if (state && "stageIds" in state) {
    const s = state as CenterState;
    items.push({ label: t("shared.academicStages"), value: String(s.stageIds?.length ?? 0) });
  } else if (state) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHead
        title={
          <span className="flex items-center gap-2">
            <GraduationCap className="size-4" aria-hidden />
            {t("shared.academicTitle")}
          </span>
        }
      />
      <div className="rounded-xl border border-rule bg-sheet p-4">
        <p className="mb-4 text-[13px] text-ink-3">{t("shared.academicSubtitle")}</p>
        {!state ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : (
          <>
            <DescriptionList columns={1} className="mb-4" items={items} />
            <Button asChild variant="outline">
              <Link href="/onboarding?edit=1">
                <Pencil className="size-4" aria-hidden />
                {t("shared.academicEditCta")}
              </Link>
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
