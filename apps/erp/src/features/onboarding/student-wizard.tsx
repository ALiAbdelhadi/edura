"use client";

import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, GraduationCap, MoonStar, School, Languages, Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "@repo/ui/components/sonner";
import { Spinner } from "@/components/kit/spinner";
import { api } from "@/lib/api/client";
import { useRouter } from "@/i18n/navigation";
import { filterStudentSecondLanguage } from "@/lib/services/catalog/second-language";
import {
  OptionCard,
  WizardActions,
  WizardCount,
  WizardEmpty,
  WizardShell,
  WizardSkeleton,
} from "./wizard-shell";
import { Chip, Eyebrow, Hairline, Sheet } from "@/components/ledger";
import { useOnboarding, apiSend, type OnboardingInitial } from "./use-onboarding";
import { studentSteps, stepAfterGrade, stepAfterSystem, stepAfterTrack, type StudentStepId } from "./steps";
import type { CatalogSubject, StudentSelections } from "./types";

type StepId = StudentStepId;

export type StudentState = {
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

export function StudentWizard({ initial }: { initial?: OnboardingInitial<StudentState> } = {}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { tree, state, error, saveDraft, draftFailed } = useOnboarding<StudentState>(initial);

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
    api
      .get(`catalog/subjects?gradeLevelId=${sel.gradeLevelId}&secondLanguage=1`)
      .json<{ data: unknown }>()
      .then((j) => setLangOptions(Array.isArray(j.data) ? (j.data as CatalogSubject[]) : []))
      .catch(() => setLangOptions([]));
  }, [stepId, sel.gradeLevelId]);

  useEffect(() => {
    if (stepId !== "review" || !sel.gradeLevelId) return;
    setPreview(null);
    const q = new URLSearchParams({ gradeLevelId: sel.gradeLevelId });
    if (sel.trackId) q.set("trackId", sel.trackId);
    api
      .get(`catalog/subjects?${q}`)
      .json<{ data: unknown }>()
      .then((j) => setPreview(Array.isArray(j.data) ? (j.data as CatalogSubject[]) : []))
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

  if (error) {
    return (
      <div className="p-8 text-center text-sm font-medium" style={{ color: "var(--red)" }}>
        {error}
      </div>
    );
  }
  if (!tree || !state) return <WizardSkeleton />;

  const back =
    stepIndex > 0
      ? () => {
          const prev = steps[Math.max(0, stepIndex - 1)] as StepId;
          setStepId(prev);
          saveDraft({ step: prev, selections: sel });
        }
      : undefined;

  const trail =
    stepId === "review"
      ? []
      : [
          stepId !== "system" && system ? dn(system) : null,
          !["system", "stage"].includes(stepId) && stage ? dn(stage) : null,
          !["system", "stage", "grade"].includes(stepId) && grade ? dn(grade) : null,
        ].filter((x): x is string => !!x);

  const shell = (children: React.ReactNode, footer?: React.ReactNode) => (
    <WizardShell
      draftFailed={draftFailed}
      eyebrow={t(`onboarding.steps.${stepId === "secondLanguage" ? "secondLanguage" : stepId}` as Parameters<typeof t>[0])}
      question={t(`onboarding.prompts.${stepId}` as Parameters<typeof t>[0])}
      trail={trail}
      current={stepIndex + 1}
      total={steps.length}
      onBack={back}
      footer={footer}
    >
      {children}
    </WizardShell>
  );

  if (stepId === "system") {
    if (tree.length === 0) {
      return shell(
        <WizardEmpty
          title={t("onboarding.empty.noSystems")}
          onRetry={() => window.location.reload()}
        />,
      );
    }
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
    if ((system?.stages.length ?? 0) === 0) {
      return shell(<WizardEmpty title={t("onboarding.empty.noStages")} />);
    }
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
    if ((stage?.gradeLevels.length ?? 0) === 0) {
      return shell(<WizardEmpty title={t("onboarding.empty.noGrades")} />);
    }
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
    if ((grade?.trackOptions.length ?? 0) === 0) {
      return shell(<WizardEmpty title={t("onboarding.empty.noTracks")} />);
    }
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
            <div className="h-16 animate-pulse rounded-xl" style={{ background: "var(--rule-2)" }} />
            <div className="h-16 animate-pulse rounded-xl" style={{ background: "var(--rule-2)" }} />
          </>
        ) : langOptions.length === 0 ? (
          <p className="text-center text-sm" style={{ color: "var(--ink-2)" }}>
            {t("onboarding.empty.noOptions")}
          </p>
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
      <WizardActions
        variant="secondary"
        label={t("onboarding.skip")}
        onClick={() => go("review", { ...sel, secondLanguageSubjectId: null })}
      />,
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

  const previewSubjects =
    preview === null ? null : filterStudentSecondLanguage(preview, sel.secondLanguageSubjectId);

  return shell(
    <div className="grid gap-6">
      <Sheet className="px-4">
        <dl className="grid">
          {rows.map(([k, v], i) => (
            <div key={k} className="grid gap-4 py-3">
              {i > 0 ? <Hairline className="-mt-3 mb-3" /> : null}
              <div className="flex items-center justify-between gap-4">
                <dt className="text-sm" style={{ color: "var(--ink-2)" }}>
                  {k}
                </dt>
                <dd className="text-end font-medium" style={{ color: "var(--ink)" }}>
                  {v}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </Sheet>

      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <Eyebrow>{t("onboarding.review.subjectsPreview")}</Eyebrow>
          {previewSubjects && previewSubjects.length > 0 ? (
            <WizardCount>
              {t("onboarding.review.subjectsCount", { count: previewSubjects.length })}
            </WizardCount>
          ) : null}
        </div>
        {previewSubjects === null ? (
          <div className="h-16 animate-pulse rounded-xl" style={{ background: "var(--rule-2)" }} />
        ) : previewSubjects.length === 0 ? (
          <p
            className="rounded-lg px-3 py-2 text-sm"
            style={{
              color: "var(--amber)",
              background: "var(--amber-soft)",
            }}
          >
            {t("onboarding.empty.noSubjects")}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {previewSubjects.map((s) => (
              <Chip key={s.id} tone="indigo">
                {dn(s)}
              </Chip>
            ))}
          </div>
        )}
      </div>
    </div>,
    <WizardActions
      label={t("onboarding.confirm")}
      onClick={() => void confirm()}
      busy={submitting}
      icon={submitting ? <Spinner /> : <Check className="size-4" aria-hidden />}
    />,
  );
}
