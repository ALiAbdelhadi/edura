"use client";

import React, { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { toast } from "@repo/ui/components/sonner";
import { Spinner } from "@/components/kit/spinner";
import { useRouter } from "@/i18n/navigation";
import { Combobox } from "@/components/kit/combobox";
import {
  governorateOptions,
  cityOptions,
  governorateLabel,
  cityLabel,
} from "@/lib/egypt-locations";
import {
  OptionChip,
  WizardActions,
  WizardCount,
  WizardShell,
  WizardSkeleton,
} from "./wizard-shell";
import { Chip, Hairline, Sheet, SectionHeading } from "@/components/ledger";
import { useOnboarding, apiSend, type OnboardingInitial } from "./use-onboarding";

type StepId = "centerInfo" | "coverage" | "review";

export type CenterState = {
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

export function CenterWizard({ initial }: { initial?: OnboardingInitial<CenterState> } = {}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { tree, state, error, saveDraft } = useOnboarding<CenterState>(initial);

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
          persist(prev);
        }
      : undefined;

  const trail = stepId !== "centerInfo" && info.name.trim() ? [info.name.trim()] : [];

  const shell = (children: React.ReactNode, footer: React.ReactNode) => (
    <WizardShell
      eyebrow={t(
        `onboarding.steps.${stepId === "centerInfo" ? "centerInfo" : stepId === "coverage" ? "coverage" : "review"}` as Parameters<typeof t>[0],
      )}
      question={t(
        `onboarding.prompts.${stepId === "centerInfo" ? "centerInfo" : stepId === "coverage" ? "coverage" : "centerReview"}` as Parameters<typeof t>[0],
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

  if (stepId === "centerInfo") {
    const setField = (key: keyof typeof info, value: string) => {
      const next = { ...info, [key]: value };
      setInfo(next);
      persist(stepId, next);
    };
    const setGovernorate = (value: string | null) => {
      const next = { ...info, governorate: value ?? "", area: "" };
      setInfo(next);
      persist(stepId, next);
    };
    return shell(
      <Sheet className="grid gap-4 p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="c-name">{t("onboarding.center.name")}</Label>
          <Input
            id="c-name"
            value={info.name}
            onChange={(e) => setField("name", e.target.value)}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="c-governorate">
            {t("onboarding.center.governorate")}
          </Label>
          <Combobox
            id="c-governorate"
            options={governorateOptions(locale)}
            value={info.governorate || null}
            onChange={setGovernorate}
            placeholder={t("onboarding.center.governoratePlaceholder")}
            searchPlaceholder={t("onboarding.center.searchPlaceholder")}
            emptyText={t("onboarding.center.noResults")}
            clearLabel={t("onboarding.center.clear")}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="c-area">{t("onboarding.center.area")}</Label>
          <Combobox
            id="c-area"
            options={cityOptions(info.governorate, locale)}
            value={info.area || null}
            onChange={(v) => setField("area", v ?? "")}
            placeholder={
              info.governorate
                ? t("onboarding.center.areaPlaceholder")
                : t("onboarding.center.areaNeedsGovernorate")
            }
            searchPlaceholder={t("onboarding.center.searchPlaceholder")}
            emptyText={t("onboarding.center.noResults")}
            clearLabel={t("onboarding.center.clear")}
            disabled={!info.governorate}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="c-phone">{t("onboarding.center.phone")}</Label>
          <Input
            id="c-phone"
            dir="ltr"
            value={info.phone}
            onChange={(e) => setField("phone", e.target.value)}
          />
        </div>
      </Sheet>,
      <WizardActions
        label={t("onboarding.next")}
        disabled={!info.name.trim()}
        hint={t("onboarding.errors.nameRequired")}
        onClick={() => {
          setStepId("coverage");
          persist("coverage");
        }}
      />,
    );
  }

  if (stepId === "coverage") {
    return shell(
      <div className="grid gap-4">
        {tree.map((sys) => {
          const inThisSystem = sys.stages.filter((st) => stageIds.includes(st.id)).length;
          return (
            <Sheet key={sys.id} className="grid gap-3 p-4">
              <SectionHeading
                title={dn(sys)}
                action={
                  inThisSystem > 0 ? (
                    <WizardCount>
                      {t("onboarding.center.stagesCount", { count: inThisSystem })}
                    </WizardCount>
                  ) : null
                }
              />
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
            </Sheet>
          );
        })}
      </div>,
      <WizardActions
        label={t("onboarding.next")}
        disabled={stageIds.length === 0}
        hint={t("onboarding.errors.selectAtLeastOne")}
        onClick={() => {
          setStepId("review");
          persist("review");
        }}
      />,
    );
  }

  const stageById = new Map(
    tree.flatMap((sys) => sys.stages.map((st) => [st.id, { st, sys }] as const)),
  );

  const rows: [string, string][] = [
    [t("onboarding.center.name"), info.name],
    [
      t("onboarding.center.governorate"),
      info.governorate ? governorateLabel(info.governorate, locale) : t("onboarding.review.none"),
    ],
    [
      t("onboarding.center.area"),
      info.area ? cityLabel(info.governorate, info.area, locale) : t("onboarding.review.none"),
    ],
    [t("onboarding.center.phone"), info.phone || t("onboarding.review.none")],
  ];

  return shell(
    <div className="grid gap-4">
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

      <Sheet className="grid gap-3 p-4">
        <SectionHeading
          title={t("onboarding.center.coverage")}
          action={
            <WizardCount>
              {t("onboarding.center.stagesCount", { count: stageIds.length })}
            </WizardCount>
          }
        />
        <div className="flex flex-wrap gap-1.5">
          {stageIds.map((id) => {
            const hit = stageById.get(id);
            return hit ? (
              <Chip key={id} tone="indigo">
                {dn(hit.sys)} · {dn(hit.st)}
              </Chip>
            ) : null;
          })}
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
