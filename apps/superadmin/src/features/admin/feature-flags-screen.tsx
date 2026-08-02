"use client";

/* مفاتيح الميزات / Feature flags.
   ══════════════════════════════════════════════════════════════════════════════

   A switch that changes what the whole platform does is a commit, so the screen is
   built the way the constitution builds commits — but only as far as the guarantee
   goes, and no further:

   - IT IS ONE PRESS, NOT TWO. A flag is reversible in the next second; claiming
     permanence with a two-step commit would be a lie about a reversible act
     (D-022, the same reasoning as the wallet-policy bounds).
   - THE STATE IS NAMED, NOT COLOURED. «مفعّل / معطّل» beside the switch, because a
     kill switch read at 3am must not depend on the reader distinguishing teal from
     grey.
   - "NEVER SET" IS ITS OWN STATE. A key code knows about but the database has never
     stored reads as «لم يُضبط» — not as "off". They behave identically today, and
     conflating them is exactly how someone concludes a flag was deliberately
     disabled when in truth nobody ever touched it.
   - THE ACTOR AND THE MOMENT ARE ON THE ROW. Every flip writes an audit row; the
     row shows the last one so the screen agrees with the log. */

import { useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { Flag, TriangleAlert } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { StatusBadge } from "@repo/ui/components/status-badge";
import { toast } from "@repo/ui/components/sonner";
import { formatDate, type Locale } from "@repo/ui/lib/format";

import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner } from "@/components/kit/spinner";
import { asArray } from "@/lib/refine/as-array";

type FlagRow = {
  key: string;
  description: string | null;
  enabled: boolean;
  note: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  /** false = no row exists yet; the flag is reading as its fallback. */
  persisted: boolean;
};

export function FeatureFlagsScreen() {
  const t = useTranslations("featureFlags");
  const locale = useLocale() as Locale;

  const { query, result } = useCustom({ url: "admin/feature-flags", method: "get" });
  const { mutateAsync: save } = useCustomMutation();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const flags = asArray<FlagRow>(result?.data);

  const toggle = async (flag: FlagRow) => {
    setBusyKey(flag.key);
    try {
      await save({
        url: "admin/feature-flags",
        method: "put",
        values: { key: flag.key, enabled: !flag.enabled },
      });
      toast.success(!flag.enabled ? t("enabledOk", { key: flag.key }) : t("disabledOk", { key: flag.key }));
      void query.refetch();
    } catch {
      toast.error(t("saveFail"));
    } finally {
      setBusyKey(null);
    }
  };

  if (query.isLoading) return <PageSpinner label={t("loading")} />;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-5">
      <PageHeader title={t("title")} description={t("subtitle")} rule />

      <p className="flex gap-2 rounded-lg border border-rule bg-field p-3 text-[13px] text-ink-2">
        <TriangleAlert className="mt-px size-4 shrink-0 text-amber" aria-hidden="true" />
        <span>
          <span className="font-semibold text-ink">{t("defaultClosedTitle")}</span> —{" "}
          {t("defaultClosedBody")}
        </span>
      </p>

      <ul className="flex flex-col gap-3">
        {flags.map((flag) => (
          <li
            key={flag.key}
            className="rounded-xl border border-rule bg-sheet p-4 shadow-[var(--lift)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {/* A key is a Latin code sitting in Arabic prose — the single
                      most common bidi break in the product. Isolate it. */}
                  <code className="num rounded bg-field px-1.5 py-0.5 text-[13px] text-ink" dir="ltr">
                    {flag.key}
                  </code>
                  <StatusBadge tone={flag.enabled ? "success" : "neutral"}>
                    {flag.enabled ? t("on") : flag.persisted ? t("off") : t("neverSet")}
                  </StatusBadge>
                </div>
                {flag.description ? (
                  <p className="mt-1.5 text-[13px] text-ink-2">{flag.description}</p>
                ) : null}
                {flag.updatedAt ? (
                  <p className="mt-1.5 text-xs text-ink-3">
                    {t("lastChanged", {
                      when: formatDate(flag.updatedAt, locale, {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      }),
                    })}
                  </p>
                ) : null}
              </div>

              <Button
                variant={flag.enabled ? "outline" : "default"}
                size="sm"
                disabled={busyKey === flag.key}
                onClick={() => void toggle(flag)}
              >
                {flag.enabled ? t("disable") : t("enable")}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {flags.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-rule bg-sheet p-10 text-center">
          <Flag className="size-5 text-ink-3" aria-hidden="true" />
          <Eyebrow locale={locale}>{t("emptyTitle")}</Eyebrow>
          <p className="text-[13px] text-ink-2">{t("emptyBody")}</p>
        </div>
      ) : null}
    </div>
  );
}
