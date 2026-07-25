"use client";

import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, GraduationCap, MoonStar, School, Languages, Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Badge } from "@repo/ui/components/badge";
import { Skeleton } from "@repo/ui/components/skeleton";
import { toast } from "@repo/ui/components/sonner";
import { Spinner } from "@/components/kit/spinner";
import { useRouter } from "@/i18n/navigation";
import { filterStudentSecondLanguage } from "@/lib/services/catalog/second-language";
import { WizardShell, OptionCard } from "./wizard-shell";
import { useOnboarding, apiSend } from "./use-onboarding";
import { studentSteps, stepAfterGrade, stepAfterSystem, stepAfterTrack, type StudentStepId } from "./steps";
import type { CatalogSubject, StudentSelections } from "./types";

type StepId = StudentStepId;

type StudentState = {
  role: "student";
  onboardingCompleted: boolean;
  onboardingDraft: { step?: StepId; selections?: StudentSelections } | null;
  educationSystemId: string | null;
  stageId: string | null;
  gradeLevelId: string | null;
  trackId: string | null;
  secondLanguageSubjectId: string | null;
};

const SYSTEM_ICONS: Record<string, React.ReactNode> = {
  school: <School />,
  "moon-star": <MoonStar />,
  "graduation-cap": <GraduationCap />,
};

export function StudentWizard() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { tree, state, error, saveDraft } = useOnboarding<StudentState>();

  const [sel, setSel] = useState<StudentSelections>({});
  const [stepId, setStepId] = useState<StepId>("system");
  const [restored, setRestored] = useState(false);
  const [langOptions, setLangOptions] = useState<CatalogSubject[] | null>(null);
  const [preview, setPreview] = useState<CatalogSubject[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dn = (x: { nameAr: string; nameEn: string | null }) =>
    locale === "en" && x.nameEn ? x.nameEn : x.nameAr;

  useEffect(() => {
    if (!state || restored) return;
    setRestored(true);
    const draft = state.onboardingDraft;
    if (draft?.selections) {
      setSel(draft.selections);
      if (draft.step) setStepId(draft.step);
      toast.info(t("onboarding.draftRestored"));
    } else if (state.educationSystemId) {
      setSel({
        educationSystemId: state.educationSystemId,
        stageId: state.stageId ?? undefined,
        gradeLevelId: state.gradeLevelId ?? undefined,
        trackId: state.trackId,
        secondLanguageSubjectId: state.secondLanguageSubjectId,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, restored]);

  const system = useMemo(() => tree?.find((s) => s.id === sel.educationSystemId), [tree, sel.educationSystemId]);
  const stage = useMemo(() => system?.stages.find((s) => s.id === sel.stageId), [system, sel.stageId]);
  const grade = useMemo(() => stage?.gradeLevels.find((g) => g.id === sel.gradeLevelId), [stage, sel.gradeLevelId]);

  const needsTrack = (grade?.trackOptions.length ?? 0) > 0;
  const needsLang = !!stage?.hasSecondLanguage;

  const steps: StepId[] = useMemo(() => studentSteps({ needsTrack, needsLang }), [needsTrack, needsLang]);

  const stepIndex = Math.max(0, steps.indexOf(stepId));

  const go = (next: StepId, nextSel: StudentSelections) => {
    setSel(nextSel);
    setStepId(next);
    saveDraft({ step: next, selections: nextSel });
  };

  const advanceAfterGrade = (nextSel: StudentSelections, gradeHasTracks: boolean, stageHasLang: boolean) =>
    go(stepAfterGrade({ gradeHasTracks, stageHasLang }), nextSel);

  useEffect(() => {
    if (stepId !== "secondLanguage" || !sel.gradeLevelId) return;
    setLangOptions(null);
    fetch(`/api/v1/catalog/subjects?gradeLevelId=${sel.gradeLevelId}&secondLanguage=1`)
      .then((r) => r.json())
      .then((j) => setLangOptions(Array.isArray(j.data) ? j.data : []))
      .catch(() => setLangOptions([]));
  }, [stepId, sel.gradeLevelId]);

  useEffect(() => {
    if (stepId !== "review" || !sel.gradeLevelId) return;
    setPreview(null);
    const q = sel.trackId ? `&trackId=${sel.trackId}` : "";
    fetch(`/api/v1/catalog/subjects?gradeLevelId=${sel.gradeLevelId}${q}`)
      .then((r) => r.json())
      .then((j) => setPreview(Array.isArray(j.data) ? j.data : []))
      .catch(() => setPreview([]));
  }, [stepId, sel.gradeLevelId, sel.trackId]);

  async function confirm() {
    if (!sel.educationSystemId || !sel.stageId || !sel.gradeLevelId) return;
    setSubmitting(true);
    try {
      await apiSend("/api/v1/me/onboarding", "POST", {
        educationSystemId: sel.educationSystemId,
        stageId: sel.stageId,
        gradeLevelId: sel.gradeLevelId,
        trackId: sel.trackId ?? null,
        secondLanguageSubjectId: sel.secondLanguageSubjectId ?? null,
      });
      toast.success(t("onboarding.completedToast"));
      router.replace("/dashboard/student");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.failed"));
      setSubmitting(false);
    }
  }

  if (error) return <div className="p-8 text-center text-destructive">{error}</div>;
  if (!tree || !state) {
    return (
      <div className="mx-auto grid max-w-2xl gap-4 px-4 py-16">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  const back =
    stepIndex > 0
      ? () => {
          const prev = steps[Math.max(0, stepIndex - 1)] as StepId;
          setStepId(prev);
          saveDraft({ step: prev, selections: sel });
        }
      : undefined;

  const shell = (children: React.ReactNode, footer?: React.ReactNode) => (
    <WizardShell
      title={t(`onboarding.steps.${stepId === "secondLanguage" ? "secondLanguage" : stepId}` as Parameters<typeof t>[0])}
      prompt={t(`onboarding.prompts.${stepId}` as Parameters<typeof t>[0])}
      current={stepIndex + 1}
      total={steps.length}
      onBack={back}
      footer={footer}
    >
      {children}
    </WizardShell>
  );

  if (stepId === "system") {
    return shell(
      <div className="grid gap-3">
        {tree.map((s) => (
          <OptionCard
            key={s.id}
            title={dn(s)}
            icon={SYSTEM_ICONS[s.iconKey ?? ""] ?? <BookOpen />}
            selected={sel.educationSystemId === s.id}
            onClick={() => {
              const nextSel: StudentSelections = { educationSystemId: s.id };
              const next = stepAfterSystem({ stageCount: s.stages.length });
              if (next === "grade") nextSel.stageId = s.stages[0]!.id;
              go(next, nextSel);
            }}
          />
        ))}
      </div>,
    );
  }

  if (stepId === "stage") {
    return shell(
      <div className="grid gap-3">
        {(system?.stages ?? []).map((s) => (
          <OptionCard
            key={s.id}
            title={dn(s)}
            selected={sel.stageId === s.id}
            onClick={() => go("grade", { educationSystemId: sel.educationSystemId, stageId: s.id })}
          />
        ))}
      </div>,
    );
  }

  if (stepId === "grade") {
    return shell(
      <div className="grid gap-3 sm:grid-cols-2">
        {(stage?.gradeLevels ?? []).map((g) => (
          <OptionCard
            key={g.id}
            title={dn(g)}
            selected={sel.gradeLevelId === g.id}
            onClick={() =>
              advanceAfterGrade(
                { educationSystemId: sel.educationSystemId, stageId: sel.stageId, gradeLevelId: g.id },
                g.trackOptions.length > 0,
                !!stage?.hasSecondLanguage,
              )
            }
          />
        ))}
      </div>,
    );
  }

  if (stepId === "track") {
    return shell(
      <div className="grid gap-3">
        {(grade?.trackOptions ?? []).map((tr) => (
          <OptionCard
            key={tr.id}
            title={dn(tr)}
            selected={sel.trackId === tr.id}
            onClick={() => go(stepAfterTrack({ stageHasLang: needsLang }), { ...sel, trackId: tr.id })}
          />
        ))}
      </div>,
    );
  }

  if (stepId === "secondLanguage") {
    return shell(
      <div className="grid gap-3">
        {langOptions === null ? (
          <>
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </>
        ) : langOptions.length === 0 ? (
          <p className="text-center text-muted-foreground">{t("onboarding.empty.noOptions")}</p>
        ) : (
          langOptions.map((s) => (
            <OptionCard
              key={s.id}
              title={dn(s)}
              icon={<Languages />}
              selected={sel.secondLanguageSubjectId === s.id}
              onClick={() => go("review", { ...sel, secondLanguageSubjectId: s.id })}
            />
          ))
        )}
      </div>,
      <Button
        variant="outline"
        className="w-full"
        onClick={() => go("review", { ...sel, secondLanguageSubjectId: null })}
      >
        {t("onboarding.skip")}
      </Button>,
    );
  }

  const langName = langOptions?.find((l) => l.id === sel.secondLanguageSubjectId);
  const trackName = grade?.trackOptions.find((tr) => tr.id === sel.trackId);
  const rows: [string, string][] = [
    [t("onboarding.review.system"), system ? dn(system) : t("onboarding.review.none")],
    [t("onboarding.review.stage"), stage ? dn(stage) : t("onboarding.review.none")],
    [t("onboarding.review.grade"), grade ? dn(grade) : t("onboarding.review.none")],
  ];
  if (needsTrack) rows.push([t("onboarding.review.track"), trackName ? dn(trackName) : t("onboarding.review.none")]);
  if (needsLang)
    rows.push([t("onboarding.review.secondLanguage"), langName ? dn(langName) : t("onboarding.review.none")]);

  return shell(
    <div className="grid gap-6">
      <dl className="grid gap-3 rounded-xl border p-4">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4">
            <dt className="text-sm text-muted-foreground">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          {t("onboarding.review.subjectsPreview")}
        </h2>
        {preview === null ? (
          <Skeleton className="h-16" />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {filterStudentSecondLanguage(preview, sel.secondLanguageSubjectId)
              .map((s) => (
                <Badge key={s.id} variant="secondary">
                  {dn(s)}
                </Badge>
              ))}
          </div>
        )}
      </div>
    </div>,
    <Button className="w-full" size="lg" onClick={() => void confirm()} disabled={submitting}>
      {submitting ? <Spinner /> : <Check className="size-4" />}
      {t("onboarding.confirm")}
    </Button>,
  );
}
