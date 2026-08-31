"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Check, CirclePlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { toast } from "@repo/ui/components/sonner";
import { Spinner } from "@/components/kit/spinner";
import { api } from "@/lib/api/client";
import { useRouter } from "@/i18n/navigation";
import {
  OptionChip,
  WizardActions,
  WizardCount,
  WizardShell,
  WizardSkeleton,
} from "./wizard-shell";
import { Chip, Eyebrow, LedgerButton, Sheet, SectionHeading } from "@/components/ledger";
import { useOnboarding, apiSend, type OnboardingInitial } from "./use-onboarding";
import type { CatalogSubject } from "./types";

type StepId = "grades" | "subjects" | "review";

export type TeacherState = {
  role: "teacher";
  onboardingCompleted: boolean;
  onboardingDraft: { step?: StepId; gradeLevelIds?: string[]; subjectIds?: string[] } | null;
  gradeLevelIds: string[];
  subjectIds: string[];
};

export function TeacherWizard({ initial }: { initial?: OnboardingInitial<TeacherState> } = {}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { tree, state, error, saveDraft, draftFailed } = useOnboarding<TeacherState>(initial);

  const [stepId, setStepId] = useState<StepId>("grades");
  const [gradeIds, setGradeIds] = useState<string[]>([]);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [restored, setRestored] = useState(false);
  const [subjects, setSubjects] = useState<CatalogSubject[] | null>(null);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [requestNotes, setRequestNotes] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);

  const dn = (x: { nameAr: string; nameEn: string | null }) =>
    locale === "en" && x.nameEn ? x.nameEn : x.nameAr;

  useEffect(() => {
    if (!state || restored) return;
    setRestored(true);
    const draft = state.onboardingDraft;
    if (draft?.gradeLevelIds?.length) {
      setGradeIds(draft.gradeLevelIds);
      setSubjectIds(draft.subjectIds ?? []);
      if (draft.step) setStepId(draft.step);
      toast.info(t("onboarding.draftRestored"));
    } else if (state.gradeLevelIds.length) {
      setGradeIds(state.gradeLevelIds);
      setSubjectIds(state.subjectIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, restored]);

  useEffect(() => {
    if (stepId !== "subjects" || gradeIds.length === 0) return;
    setSubjects(null);
    api
      .get(`catalog/subjects?gradeLevelIds=${gradeIds.join(",")}`)
      .json<{ data: unknown }>()
      .then((j) => {
        const list: CatalogSubject[] = Array.isArray(j.data) ? (j.data as CatalogSubject[]) : [];
        setSubjects(list);
        setSubjectIds((prev) => prev.filter((id) => list.some((s) => s.id === id)));
      })
      .catch(() => setSubjects([]));
  }, [stepId, gradeIds]);

  const steps: StepId[] = ["grades", "subjects", "review"];
  const stepIndex = steps.indexOf(stepId);

  const persistDraft = (step: StepId, g: string[], s: string[]) =>
    saveDraft({ step, gradeLevelIds: g, subjectIds: s });

  const toggleGrade = (id: string) => {
    setGradeIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      persistDraft(stepId, next, subjectIds);
      return next;
    });
  };

  const toggleSubject = (id: string) => {
    setSubjectIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      persistDraft(stepId, gradeIds, next);
      return next;
    });
  };

  const filteredSubjects = useMemo(() => {
    if (!subjects) return null;
    const q = search.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter(
      (s) => s.nameAr.toLowerCase().includes(q) || (s.nameEn ?? "").toLowerCase().includes(q),
    );
  }, [subjects, search]);

  async function confirm() {
    setSubmitting(true);
    try {
      await apiSend("/api/v1/me/onboarding", "POST", { gradeLevelIds: gradeIds, subjectIds });
      toast.success(t("onboarding.completedToast"));
      router.replace("/dashboard/teacher");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.failed"));
      setSubmitting(false);
    }
  }

  async function sendRequest() {
    if (!requestName.trim()) return;
    setRequestBusy(true);
    try {
      await apiSend("/api/v1/me/subject-requests", "POST", {
        suggestedName: requestName.trim(),
        gradeLevelId: gradeIds[0] ?? null,
        notes: requestNotes.trim() || null,
      });
      toast.success(t("onboarding.teacher.requestSent"));
      setRequestOpen(false);
      setRequestName("");
      setRequestNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.failed"));
    } finally {
      setRequestBusy(false);
    }
  }

  if (error)
    return (
      <div className="p-8 text-center text-sm font-medium" style={{ color: "var(--red)" }}>
        {error}
      </div>
    );
  if (!tree || !state) return <WizardSkeleton rows={2} />;

  const back =
    stepIndex > 0
      ? () => {
          const prev = steps[stepIndex - 1] as StepId;
          setStepId(prev);
          persistDraft(prev, gradeIds, subjectIds);
        }
      : undefined;

  const gradeById = new Map(
    tree.flatMap((sys) => sys.stages.flatMap((st) => st.gradeLevels.map((g) => [g.id, { g, st, sys }] as const))),
  );

  const trail =
    stepId === "subjects" && gradeIds.length > 0
      ? [t("onboarding.review.gradesCount", { count: gradeIds.length })]
      : [];

  const shell = (children: React.ReactNode, footer: React.ReactNode) => (
    <WizardShell
      draftFailed={draftFailed}
      eyebrow={t(
        `onboarding.steps.${stepId === "grades" ? "grades" : stepId === "subjects" ? "subjects" : "review"}` as Parameters<typeof t>[0],
      )}
      question={t(
        `onboarding.prompts.${stepId === "grades" ? "teacherGrades" : stepId === "subjects" ? "teacherSubjects" : "teacherReview"}` as Parameters<typeof t>[0],
      )}
      trail={trail}
      current={stepIndex + 1}
      total={steps.length}
      onBack={back}
      footer={footer}
    >
      {children}
    </WizardShell>
  );

  if (stepId === "grades") {
    return shell(
      <div className="grid gap-6">
        {tree.map((sys) => {
          const inThisSystem = sys.stages.reduce(
            (n, st) => n + st.gradeLevels.filter((g) => gradeIds.includes(g.id)).length,
            0,
          );
          return (
            <Sheet key={sys.id} className="grid gap-4 p-4">
              <SectionHeading
                title={dn(sys)}
                action={
                  inThisSystem > 0 ? (
                    <WizardCount>
                      {t("onboarding.review.gradesCount", { count: inThisSystem })}
                    </WizardCount>
                  ) : null
                }
              />
              {sys.stages.map((st) => (
                <div key={st.id} className="grid gap-2">
                  <Eyebrow>{dn(st)}</Eyebrow>
                  <div className="flex flex-wrap gap-2">
                    {st.gradeLevels.map((g) => (
                      <OptionChip
                        key={g.id}
                        label={dn(g)}
                        selected={gradeIds.includes(g.id)}
                        onClick={() => toggleGrade(g.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </Sheet>
          );
        })}
      </div>,
      <WizardActions
        label={t("onboarding.next")}
        disabled={gradeIds.length === 0}
        hint={t("onboarding.errors.selectAtLeastOne")}
        onClick={() => {
          setStepId("subjects");
          persistDraft("subjects", gradeIds, subjectIds);
        }}
      />,
    );
  }

  if (stepId === "subjects") {
    return shell(
      <div className="grid gap-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("onboarding.teacher.searchSubjects")}
        />

        <Sheet className="grid gap-3 p-4">
          <SectionHeading
            title={t("onboarding.steps.subjects")}
            action={
              subjectIds.length > 0 ? (
                <WizardCount>
                  {t("onboarding.review.subjectsCount", { count: subjectIds.length })}
                </WizardCount>
              ) : null
            }
          />
          {filteredSubjects === null ? (
            <div className="grid gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg" style={{ background: "var(--rule-2)" }} />
              ))}
            </div>
          ) : filteredSubjects.length === 0 ? (
            <p className="py-4 text-center text-sm" style={{ color: "var(--ink-2)" }}>
              {t("onboarding.teacher.noSubjectsForGrades")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filteredSubjects.map((s) => (
                <OptionChip
                  key={s.id}
                  label={dn(s)}
                  selected={subjectIds.includes(s.id)}
                  onClick={() => toggleSubject(s.id)}
                />
              ))}
            </div>
          )}
        </Sheet>

        <LedgerButton className="justify-start" onClick={() => setRequestOpen(true)}>
          <CirclePlus className="size-4" aria-hidden />
          {t("onboarding.teacher.requestSubject")}
        </LedgerButton>

        <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("onboarding.teacher.requestSubjectTitle")}</DialogTitle>
              <DialogDescription>{t("onboarding.teacher.requestSubjectBody")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="req-name">{t("onboarding.teacher.suggestedName")}</Label>
                <Input id="req-name" value={requestName} onChange={(e) => setRequestName(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="req-notes">{t("onboarding.teacher.notes")}</Label>
                <Textarea
                  id="req-notes"
                  rows={3}
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <LedgerButton onClick={() => setRequestOpen(false)} disabled={requestBusy}>
                {t("actions.cancel")}
              </LedgerButton>
              <LedgerButton
                variant="primary"
                onClick={() => void sendRequest()}
                disabled={requestBusy || !requestName.trim()}
              >
                {requestBusy ? <Spinner /> : null}
                {t("actions.sendInvite")}
              </LedgerButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>,
      <WizardActions
        label={t("onboarding.next")}
        disabled={subjectIds.length === 0}
        hint={t("onboarding.errors.selectAtLeastOne")}
        onClick={() => {
          setStepId("review");
          persistDraft("review", gradeIds, subjectIds);
        }}
      />,
    );
  }

  return shell(
    <div className="grid gap-4">
      <Sheet className="grid gap-3 p-4">
        <SectionHeading
          title={t("onboarding.teacher.selectedGrades")}
          action={
            <WizardCount>
              {t("onboarding.review.gradesCount", { count: gradeIds.length })}
            </WizardCount>
          }
        />
        <div className="flex flex-wrap gap-1.5">
          {gradeIds.map((id) => {
            const hit = gradeById.get(id);
            return hit ? (
              <Chip key={id} tone="indigo">
                {dn(hit.sys)} · {dn(hit.g)}
              </Chip>
            ) : null;
          })}
        </div>
      </Sheet>

      <Sheet className="grid gap-3 p-4">
        <SectionHeading
          title={t("onboarding.steps.subjects")}
          action={
            <WizardCount>
              {t("onboarding.review.subjectsCount", { count: subjectIds.length })}
            </WizardCount>
          }
        />
        <div className="flex flex-wrap gap-1.5">
          {(subjects ?? [])
            .filter((s) => subjectIds.includes(s.id))
            .map((s) => (
              <Chip key={s.id} tone="indigo">
                {dn(s)}
              </Chip>
            ))}
        </div>
      </Sheet>
    </div>,
    <WizardActions
      label={t("onboarding.confirm")}
      onClick={() => void confirm()}
      busy={submitting}
      icon={submitting ? <Spinner /> : <Check className="size-4" aria-hidden />}
    />,
  );
}
