"use client";

import { useCustom } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { Infinity as InfinityIcon, Wallet } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { Num } from "@repo/ui/components/num";
import type { Locale } from "@repo/ui/lib/format";

import {
  FieldControls,
  FormRootError,
  useFieldForm,
  type FieldSpec,
} from "@/features/admin/catalog/entity-dialog";
import { Form } from "@repo/ui/components/form";
import { PageHeader } from "@/components/kit/page-header";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { useAction } from "@/lib/api/use-action";

type WalletPolicy = {
  minTopup: number;
  maxTopup: number;
  updatedAt: string | null;
};

export function WalletSettingsScreen() {
  const t = useTranslations("walletPolicy");
  const queryStrings = useQueryStrings();
  const locale = useLocale() as Locale;

  const { query, result } = useCustom({ url: "admin/wallet-settings", method: "get" });
  const { run: save, busy: saving } = useAction({
    url: "admin/wallet-settings",
    method: "put",
    successMsg: t("savedOk"),
    onSuccess: () => query.refetch(),
  });

  const data = result?.data as WalletPolicy | undefined;

  // Both bounds must be positive and the ceiling must not sit under the floor.
  // Those were two toasts that named neither box; the second is a cross-field
  // rule, so it belongs to the box that has to move.
  const fields: FieldSpec[] = [
    {
      name: "minTopup",
      label: t("min"),
      type: "number",
      required: true,
      min: 0.01,
      hint: t("minHint"),
    },
    {
      name: "maxTopup",
      label: t("max"),
      type: "number",
      required: true,
      min: 0.01,
      hint: t("maxHint"),
      validate: (v) => (Number(v.maxTopup) < Number(v.minTopup) ? t("orderError") : undefined),
    },
  ];

  const { form, submit, rootError } = useFieldForm({
    fields,
    resetKey: data ? `${data.minTopup}:${data.maxTopup}` : "",
    initial: data
      ? { minTopup: data.minTopup / 100, maxTopup: data.maxTopup / 100 }
      : undefined,
    onSubmit: (v) =>
      save({
        values: {
          minTopup: Math.round(Number(v.minTopup) * 100),
          maxTopup: Math.round(Number(v.maxTopup) * 100),
        },
      }),
  });

  if (query.isError) {
    return (
      <LoadError
        message={queryStrings.loadFailed}
        onRetry={() => query.refetch()}
        retryLabel={queryStrings.retry}
      />
    );
  }
  if (query.isLoading || !data) return <PageSpinner label={t("loading")} />;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-5">
      <PageHeader title={t("title")} description={t("subtitle")} rule />

      <p className="flex gap-2 rounded-lg border border-rule bg-field p-3 text-[13px] text-ink-2">
        <InfinityIcon className="mt-px size-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-semibold text-ink">{t("noCapTitle")}</span> — {t("noCapBody")}
        </span>
      </p>

      <section className="rounded-xl border border-rule bg-sheet p-5 shadow-[var(--lift)]">
        <header className="mb-4 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-soft text-indigo"
          >
            <Wallet className="size-4" />
          </span>
          <div>
            <Eyebrow locale={locale}>{t("boundsTitle")}</Eyebrow>
            <p className="mt-0.5 text-[13px] text-ink-2">{t("boundsSubtitle")}</p>
          </div>
        </header>

        <Form {...form}>
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <FormRootError message={rootError} />
            <FieldControls
              className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2"
              fields={fields}
              form={form}
            />

        <p className="mt-4 text-xs text-ink-3">
          {t("applyNote")}
          {data.updatedAt ? (
            <>
              {" "}
              {t("lastChanged")} <Num.Date value={data.updatedAt} locale={locale} />
            </>
          ) : null}
        </p>

            <div className="mt-4 flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? <Spinner /> : null}
                {t("save")}
              </Button>
            </div>
          </form>
        </Form>
      </section>
    </div>
  );
}
