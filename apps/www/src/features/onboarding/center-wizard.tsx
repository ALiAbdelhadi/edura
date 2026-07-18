"use client";

import React, { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Badge } from "@repo/ui/components/badge";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Skeleton } from "@repo/ui/components/skeleton";
import { toast } from "@repo/ui/components/sonner";
import { Spinner } from "@/components/kit/spinner";
import { useRouter } from "@/i18n/navigation";
import { WizardShell, OptionChip } from "./wizard-shell";
import { useOnboarding, apiSend } from "./use-onboarding";

type StepId = "centerInfo" | "coverage" | "review";

type CenterState = {
  role: "center_admin";
  onboardingCompleted: boolean;
  onboardingDraft: {
    step?: StepId;
    info?: { name: string; governorate: string; area: string; phone: string };
    stageIds?: string[];
  } | null;
  center?: { name: string; governorate: string | null; area: string | null; phone: string | null };
  stageIds?: string[];
};

export function CenterWizard() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { tree, state, error, saveDraft } = useOnboarding<CenterState>();

  const [stepId, setStepId] = useState<StepId>("centerInfo");
  const [info, setInfo] = useState({ name: "", governorate: "", area: "", phone: "" });
  const [stageIds, setStageIds] = useState<string[]>([]);
  const [restored, setRestored] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const dn = (x: { nameAr: string; nameEn: string | null }) =>
    locale === "en" && x.nameEn ? x.nameEn : x.nameAr;

  useEffect(() => {
    if (!state || restored) return;
    setRestored(true);
    const draft = state.onboardingDraft;
    if (draft?.info || draft?.stageIds?.length) {
      if (draft.info) setInfo(draft.info);
      if (draft.stageIds) setStageIds(draft.stageIds);
      if (draft.step) setStepId(draft.step);
      toast.info(t("onboarding.draftRestored"));
    } else if (state.center) {
      setInfo({
        name: state.center.name ?? "",
        governorate: state.center.governorate ?? "",
        area: state.center.area ?? "",
        phone: state.center.phone ?? "",
      });
      setStageIds(state.stageIds ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, restored]);

  const steps: StepId[] = ["centerInfo", "coverage", "review"];
  const stepIndex = steps.indexOf(stepId);

  const persist = (step: StepId, i = info, s = stageIds) => saveDraft({ step, info: i, stageIds: s });

  const toggleStage = (id: string) => {
    setStageIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      persist(stepId, info, next);
      return next;
    });
  };

  async function confirm() {
    setSubmitting(true);
    try {
      await apiSend("/api/v1/me/onboarding", "POST", {
        name: info.name.trim() || undefined,
        governorate: info.governorate.trim() || null,
        area: info.area.trim() || null,
        phone: info.phone.trim() || null,
        stageIds,
      });
      toast.success(t("onboarding.completedToast"));
      router.replace("/dashboard/admin");
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
        <Skeleton className="h-40" />
      </div>
    );
  }

  const back =
    stepIndex > 0
      ? () => {
          const prev = steps[stepIndex - 1] as StepId;
          setStepId(prev);
          persist(prev);
        }
      : undefined;

  const shell = (children: React.ReactNode, footer: React.ReactNode) => (
    <WizardShell
      title={t(
        `onboarding.steps.${stepId === "centerInfo" ? "centerInfo" : stepId === "coverage" ? "coverage" : "review"}` as Parameters<typeof t>[0],
      )}
      prompt={t(
        `onboarding.prompts.${stepId === "centerInfo" ? "centerInfo" : stepId === "coverage" ? "coverage" : "centerReview"}` as Parameters<typeof t>[0],
      )}
      current={stepIndex + 1}
      total={steps.length}
      onBack={back}
      footer={footer}
    >
      {children}
    </WizardShell>
  );

  if (stepId === "centerInfo") {
    const fields: { key: keyof typeof info; label: string; dir?: "ltr" }[] = [
      { key: "name", label: t("onboarding.center.name") },
      { key: "governorate", label: t("onboarding.center.governorate") },
      { key: "area", label: t("onboarding.center.area") },
      { key: "phone", label: t("onboarding.center.phone"), dir: "ltr" },
    ];
    return shell(
      <div className="grid gap-4">
        {fields.map((f) => (
          <div key={f.key} className="grid gap-1.5">
            <Label htmlFor={`c-${f.key}`}>{f.label}</Label>
            <Input
              id={`c-${f.key}`}
              dir={f.dir}
              value={info[f.key]}
              onChange={(e) => {
                const next = { ...info, [f.key]: e.target.value };
                setInfo(next);
                persist(stepId, next);
              }}
            />
          </div>
        ))}
      </div>,
      <Button
        className="w-full"
        size="lg"
        disabled={!info.name.trim()}
        onClick={() => {
          setStepId("coverage");
          persist("coverage");
        }}
      >
        {t("onboarding.next")}
      </Button>,
    );
  }

  if (stepId === "coverage") {
    return shell(
      <div className="grid gap-6">
        {tree.map((sys) => (
          <section key={sys.id} className="grid gap-2">
            <h2 className="font-semibold">{dn(sys)}</h2>
            <div className="flex flex-wrap gap-2">
              {sys.stages.map((st) => (
                <OptionChip
                  key={st.id}
                  label={dn(st)}
                  selected={stageIds.includes(st.id)}
                  onClick={() => toggleStage(st.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>,
      <Button
        className="w-full"
        size="lg"
        disabled={stageIds.length === 0}
        onClick={() => {
          setStepId("review");
          persist("review");
        }}
      >
        {t("onboarding.next")}
        <Badge variant="secondary">{stageIds.length}</Badge>
      </Button>,
    );
  }

  const stageById = new Map(
    tree.flatMap((sys) => sys.stages.map((st) => [st.id, { st, sys }] as const)),
  );

  return shell(
    <div className="grid gap-6">
      <dl className="grid gap-3 rounded-xl border p-4">
        {(
          [
            [t("onboarding.center.name"), info.name],
            [t("onboarding.center.governorate"), info.governorate || t("onboarding.review.none")],
            [t("onboarding.center.area"), info.area || t("onboarding.review.none")],
            [t("onboarding.center.phone"), info.phone || t("onboarding.review.none")],
          ] as [string, string][]
        ).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4">
            <dt className="text-sm text-muted-foreground">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <section className="grid gap-2 rounded-xl border p-4">
        <h2 className="text-sm text-muted-foreground">
          {t("onboarding.center.coverage")} · {t("onboarding.center.stagesCount", { count: stageIds.length })}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {stageIds.map((id) => {
            const hit = stageById.get(id);
            return hit ? (
              <Badge key={id} variant="secondary">
                {dn(hit.sys)} · {dn(hit.st)}
              </Badge>
            ) : null;
          })}
        </div>
      </section>
    </div>,
    <Button className="w-full" size="lg" onClick={() => void confirm()} disabled={submitting}>
      {submitting ? <Spinner /> : <Check className="size-4" />}
      {t("onboarding.confirm")}
    </Button>,
  );
}
