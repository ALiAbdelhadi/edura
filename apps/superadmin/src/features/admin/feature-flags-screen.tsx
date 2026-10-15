"use client";

import { QUERY_FRESHNESS } from "@repo/client-core/refine/freshness";
import { useCustom } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { Flag, TriangleAlert } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { StatusBadge } from "@repo/ui/components/status-badge";
import { formatDate, type Locale } from "@repo/ui/lib/format";

import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner } from "@/components/kit/spinner";
import { useAction } from "@/lib/api/use-action";
import { asArray } from "@/lib/refine/as-array";

type FlagRow = {
  key: string;
  description: string | null;
  enabled: boolean;
  note: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  persisted: boolean;
};

export function FeatureFlagsScreen() {
  const t = useTranslations("featureFlags");
  const queryStrings = useQueryStrings();
  const locale = useLocale() as Locale;

  const { query, result } = useCustom({
    url: "admin/feature-flags",
    method: "get",
    queryOptions: QUERY_FRESHNESS.list,
  });
  const { run, busyKey } = useAction({
    url: "admin/feature-flags",
    method: "put",
    onSuccess: () => query.refetch(),
  });

  const flags = asArray<FlagRow>(result?.data);

  const toggle = (flag: FlagRow) =>
    run({
      key: flag.key,
      values: { key: flag.key, enabled: !flag.enabled },
      successMsg: !flag.enabled
        ? t("enabledOk", { key: flag.key })
        : t("disabledOk", { key: flag.key }),
    });

  if (query.isLoading) return <PageSpinner label={t("loading")} />;
  if (query.isError) {
    return (
      <div className="flex w-full max-w-3xl flex-col gap-5">
        <PageHeader title={t("title")} description={t("subtitle")} rule />
        <LoadError
          message={queryStrings.loadFailed}
          onRetry={() => query.refetch()}
          retryLabel={queryStrings.retry}
        />
      </div>
    );
  }

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
