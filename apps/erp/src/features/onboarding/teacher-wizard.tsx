"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Check, CirclePlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Badge } from "@repo/ui/components/badge";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { Skeleton } from "@repo/ui/components/skeleton";
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
import { useRouter } from "@/i18n/navigation";
import { WizardShell, OptionChip } from "./wizard-shell";
import { useOnboarding, apiSend } from "./use-onboarding";
import type { CatalogSubject } from "./types";

type StepId = "grades" | "subjects" | "review";

type TeacherState = {
  role: "teacher";
  onboardingCompleted: boolean;
  onboardingDraft: { step?: StepId; gradeLevelIds?: string[]; subjectIds?: string[] } | null;
  gradeLevelIds: string[];
  subjectIds: string[];
};

export function TeacherWizard() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { tree, state, error, saveDraft } = useOnboarding<TeacherState>();

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
    fetch(`/api/v1/catalog/subjects?gradeLevelIds=${gradeIds.join(",")}`)
      .then((r) => r.json())
      .then((j) => {
        const list: CatalogSubject[] = Array.isArray(j.data) ? j.data : [];
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

  if (error) return <div className="p-8 text-center text-destructive">{error}</div>;
  if (!tree || !state) {
    return (
      <div className="mx-auto grid max-w-2xl gap-4 px-4 py-16">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

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

  const shell = (children: React.ReactNode, footer: React.ReactNode) => (
    <WizardShell
      title={t(
        `onboarding.steps.${stepId === "grades" ? "grades" : stepId === "subjects" ? "subjects" : "review"}` as Parameters<typeof t>[0],
      )}
      prompt={t(
        `onboarding.prompts.${stepId === "grades" ? "teacherGrades" : stepId === "subjects" ? "teacherSubjects" : "teacherReview"}` as Parameters<typeof t>[0],
      )}
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
        {tree.map((sys) => (
          <section key={sys.id} className="grid gap-3">
            <h2 className="font-semibold">{dn(sys)}</h2>
            {sys.stages.map((st) => (
              <div key={st.id} className="grid gap-2">
                <p className="text-sm text-muted-foreground">{dn(st)}</p>
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
          </section>
        ))}
      </div>,
      <Button
        className="w-full"
        size="lg"
        disabled={gradeIds.length === 0}
        onClick={() => {
          setStepId("subjects");
          persistDraft("subjects", gradeIds, subjectIds);
        }}
      >
        {t("onboarding.next")}
        <Badge variant="secondary">{gradeIds.length}</Badge>
      </Button>,
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
        {filteredSubjects === null ? (
          <div className="grid gap-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : filteredSubjects.length === 0 ? (
          <p className="text-center text-muted-foreground">
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
        <Button variant="ghost" className="justify-start" onClick={() => setRequestOpen(true)}>
          <CirclePlus className="size-4" />
          {t("onboarding.teacher.requestSubject")}
        </Button>

        <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("onboarding.teacher.requestSubjectTitle")}</DialogTitle>
              <DialogDescription>{t("onboarding.teacher.requestSubjectBody")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label>{t("onboarding.teacher.suggestedName")}</Label>
                <Input value={requestName} onChange={(e) => setRequestName(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>{t("onboarding.teacher.notes")}</Label>
                <Textarea rows={3} value={requestNotes} onChange={(e) => setRequestNotes(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRequestOpen(false)} disabled={requestBusy}>
                {t("actions.cancel")}
              </Button>
              <Button onClick={() => void sendRequest()} disabled={requestBusy || !requestName.trim()}>
                {requestBusy ? <Spinner /> : null}
                {t("actions.sendInvite")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>,
      <Button
        className="w-full"
        size="lg"
        disabled={subjectIds.length === 0}
        onClick={() => {
          setStepId("review");
          persistDraft("review", gradeIds, subjectIds);
        }}
      >
        {t("onboarding.next")}
        <Badge variant="secondary">{subjectIds.length}</Badge>
      </Button>,
    );
  }

  return shell(
    <div className="grid gap-6">
      <section className="grid gap-2 rounded-xl border p-4">
        <h2 className="text-sm text-muted-foreground">
          {t("onboarding.teacher.selectedGrades")} · {t("onboarding.review.gradesCount", { count: gradeIds.length })}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {gradeIds.map((id) => {
            const hit = gradeById.get(id);
            return hit ? (
              <Badge key={id} variant="secondary">
                {dn(hit.sys)} · {dn(hit.g)}
              </Badge>
            ) : null;
          })}
        </div>
      </section>
      <section className="grid gap-2 rounded-xl border p-4">
        <h2 className="text-sm text-muted-foreground">
          {t("onboarding.steps.subjects")} · {t("onboarding.review.subjectsCount", { count: subjectIds.length })}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {(subjects ?? [])
            .filter((s) => subjectIds.includes(s.id))
            .map((s) => (
              <Badge key={s.id} variant="secondary">
                {dn(s)}
              </Badge>
            ))}
        </div>
      </section>
    </div>,
    <Button className="w-full" size="lg" onClick={() => void confirm()} disabled={submitting}>
      {submitting ? <Spinner /> : <Check className="size-4" />}
      {t("onboarding.confirm")}
    </Button>,
  );
}
