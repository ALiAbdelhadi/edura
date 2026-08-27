"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  GuidedTour as Engine,
  type TourStep,
  type TourStepContent,
} from "@repo/ui/components/guided-tour";
import { asKey } from "@/lib/i18n/keys";

export type { TourStep };

export function GuidedTour({
  steps,
  namespace,
  open,
  onClose,
}: {
  steps: TourStep[];
  namespace: string;
  open: boolean;
  onClose: () => void;
}) {
  const tx = useTranslations(asKey(namespace));
  const t = tx as unknown as (key: string, values?: Record<string, string | number>) => string;
  const locale = useLocale();

  const rawAt = (key: string): unknown => {
    const api = tx as unknown as { raw: (k: string) => unknown; has: (k: string) => boolean };
    return api.has(key) ? api.raw(key) : undefined;
  };

  const content = (id: string): TourStepContent => {
    const rawHow = rawAt(`steps.${id}.how`);
    const how =
      rawHow && typeof rawHow === "object" && !Array.isArray(rawHow)
        ? Object.entries(rawHow as Record<string, string>)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([, line]) => line)
            .filter((line) => typeof line === "string")
        : [];

    const noteKey = `steps.${id}.note`;
    const rawNote = rawAt(noteKey);
    const note =
      typeof rawNote === "string" && rawNote.length > 0 && !rawNote.endsWith(noteKey)
        ? rawNote
        : null;

    return { title: t(`steps.${id}.title`), body: t(`steps.${id}.body`), how, note };
  };

  return (
    <Engine
      steps={steps}
      open={open}
      onClose={onClose}
      rtl={locale === "ar"}
      content={content}
      labels={{
        title: t("title"),
        next: t("next"),
        back: t("back"),
        skip: t("skip"),
        finish: t("finish"),
        moreHint: t("moreHint"),
        progress: (done, total) => t("progress", { done, total }),
      }}
    />
  );
}
