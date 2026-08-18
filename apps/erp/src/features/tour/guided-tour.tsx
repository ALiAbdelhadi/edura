"use client";

/**
 * The www app's guided-tour wrapper: it knows the WORDS, the engine knows the
 * geometry.
 *
 * The engine moved to `@repo/ui/components/guided-tour` when the back office
 * needed the same walkthrough these six portals already had — the precedent
 * `student-id-card` set. This file keeps the exact public API the six call
 * sites already pass (`steps`, `namespace`, `open`, `onClose`), so promoting it
 * changed no screen.
 *
 * WHY THE COPY LOOKUP LIVES HERE. `packages/ui` has no i18n and must not gain
 * one, and the two apps resolve namespaces differently anyway — www's message
 * files are spread flat, the back office's are nested. Each app therefore owns
 * its own lookup and hands the engine plain strings.
 */

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
  /** Where the copy lives, e.g. `studentTour` or `adminHome.staffTour`. */
  namespace: string;
  open: boolean;
  onClose: () => void;
}) {
  /**
   * BOTH the namespace and the keys are runtime values, so next-intl's
   * literal-key generic has nothing to narrow against and expands until the
   * compiler gives up ("type instantiation is excessively deep"). The safety it
   * offers is already gone the moment the namespace is a prop, so it is dropped
   * explicitly — and the i18n parity test is what catches a missing key.
   */
  const tx = useTranslations(asKey(namespace));
  const t = tx as unknown as (key: string, values?: Record<string, string | number>) => string;
  const locale = useLocale();

  /**
   * `raw()` does NOT throw on a missing key — it reports the miss through
   * next-intl's error handler (a console.error, which Next's dev overlay raises
   * as a Console Error) and returns the key path as a fallback. Both `how` and
   * `note` are OPTIONAL by design, so every render of a welcome or finish card
   * logged a MISSING_MESSAGE for a key that is absent on purpose. `has()` asks
   * the same question silently.
   */
  const rawAt = (key: string): unknown => {
    const api = tx as unknown as { raw: (k: string) => unknown; has: (k: string) => boolean };
    return api.has(key) ? api.raw(key) : undefined;
  };

  const content = (id: string): TourStepContent => {
    /* The procedure is an ORDERED OBJECT rather than an array: next-intl's
       message type admits `string | nested object` and nothing else, so an
       array fails to typecheck against `Messages`. Keys are "1","2","3"… and
       are sorted numerically rather than trusted to object order. */
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
