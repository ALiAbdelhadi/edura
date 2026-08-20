"use client";

import { useEffect, useState } from "react";
import { GraduationCap, Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { SectionHead } from "@repo/ui/components/ledger";
import { DescriptionList } from "@/components/kit/description-list";
import { Spinner } from "@/components/kit/spinner";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api/client";

/**
 * What the onboarding wizard chose, and the way back into it.
 *
 * WHY THIS EXISTS: the education system, grade, track and second language a
 * student picks on day one decide which subjects the whole app shows them. They
 * were written once by the wizard and then had no editor: `/onboarding` bounces
 * a completed account straight back to the dashboard, and the `?edit=1` escape
 * hatch it already supported was linked from precisely nowhere — the same dead
 * capability `CenterProfileCard` was written to end for the center's details.
 * A student who tapped the wrong track on their first day was stuck with a
 * subject list for someone else's education until staff edited the row.
 *
 * So this shows the current answers and links to the wizard in edit mode. There
 * is no second writer: `POST /me/onboarding` is the one the wizard already
 * calls, it re-validates the whole system→stage→grade→track chain, and student
 * code issuance is once-only inside it, so re-running it cannot move a code
 * that is already printed on a card.
 *
 * Teacher and center get the same card because they have the same problem —
 * their wizard answers (which grades and subjects they teach; which stages the
 * center serves) had no editor either. The summary is deliberately thin for
 * those two: it says how many are selected and hands over to the wizard, rather
 * than resolving catalog names this screen has no other use for.
 */
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
    // A role with no wizard (parent, assistant, staff) — nothing to show.
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
