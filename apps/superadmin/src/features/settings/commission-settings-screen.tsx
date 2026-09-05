"use client";

import { useCustom } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { Info, Percent } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { Num } from "@repo/ui/components/num";
import { formatPercent, type Locale } from "@repo/ui/lib/format";

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
import { AgreementProposalsPanel } from "./agreement-proposals-panel";

type CommissionData = {
  teacherDirectCommissionBp: number;
  platformTeacherFee: number;
  platformCenterFee: number;
  updatedAt: string | null;
};

export function CommissionSettingsScreen({ readOnly }: { readOnly: boolean }) {
  const t = useTranslations("commissionSettings");
  const queryStrings = useQueryStrings();
  const locale = useLocale() as Locale;
  const apiUrl = readOnly ? "finance/commission-settings" : "admin/commission-settings";

  const { query, result } = useCustom({ url: apiUrl, method: "get" });
  const { run: save, busy: saving } = useAction({
    url: "admin/commission-settings",
    method: "put",
    successMsg: t("savedOk"),
    onSuccess: () => query.refetch(),
  });

  const data = result?.data as CommissionData | undefined;

  // Two toasts named neither box: one for the percentage being out of range,
  // one for either fee being negative. Each is a per-field bound now.
  const fields: FieldSpec[] = [
    {
      name: "teacherDirectCommissionBp",
      label: t("pct"),
      type: "number",
      required: true,
      min: 0,
      max: 100,
      hint: t("pctHint"),
    },
    { name: "platformTeacherFee", label: t("teacherFee"), type: "number", required: true, min: 0 },
    { name: "platformCenterFee", label: t("centerFee"), type: "number", required: true, min: 0 },
  ];

  const { form, submit, rootError } = useFieldForm({
    fields,
    resetKey: data
      ? `${data.teacherDirectCommissionBp}:${data.platformTeacherFee}:${data.platformCenterFee}`
      : "",
    initial: data
      ? {
          teacherDirectCommissionBp: data.teacherDirectCommissionBp / 100,
          platformTeacherFee: data.platformTeacherFee / 100,
          platformCenterFee: data.platformCenterFee / 100,
        }
      : undefined,
    onSubmit: (v) =>
      save({
        values: {
          teacherDirectCommissionBp: Math.round(Number(v.teacherDirectCommissionBp) * 100),
          platformTeacherFee: Math.round(Number(v.platformTeacherFee) * 100),
          platformCenterFee: Math.round(Number(v.platformCenterFee) * 100),
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

      {readOnly ? (
        <p className="flex gap-2 rounded-lg border border-rule bg-field p-3 text-[13px] text-ink-2">
          <Info className="mt-px size-4 shrink-0" aria-hidden="true" />
          {t("readOnlyNote")}
        </p>
      ) : null}

      <section className="rounded-xl border border-rule bg-sheet p-5 shadow-[var(--lift)]">
        <header className="mb-4 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-soft text-indigo"
          >
            <Percent className="size-4" />
          </span>
          <div>
            <Eyebrow locale={locale}>
              {readOnly ? t("effective") : t("globalTitle")}
            </Eyebrow>
            <p className="mt-0.5 text-[13px] text-ink-2">{t("globalSubtitle")}</p>
          </div>
        </header>

        {readOnly ? (
          <dl className="flex flex-col gap-3">
            <Figure label={t("pct")}>
              <Num>{formatPercent(data.teacherDirectCommissionBp / 100, locale)}</Num>
            </Figure>
            <Figure label={t("teacherFee")}>
              <Num.Money piasters={data.platformTeacherFee} locale={locale} sign={false} />
            </Figure>
            <Figure label={t("centerFee")}>
              <Num.Money piasters={data.platformCenterFee} locale={locale} sign={false} />
            </Figure>
          </dl>
        ) : (
          <Form {...form}>
            <form id="commission-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
              <FormRootError message={rootError} />
              <FieldControls className="flex flex-col gap-4" fields={[fields[0]!]} form={form} />
              <FieldControls
                className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
                fields={[fields[1]!, fields[2]!]}
                form={form}
              />
            </form>
          </Form>
        )}

        <p className="mt-4 text-xs text-ink-3">
          {t("feesHint")} {t("forwardOnly")}
          {data.updatedAt ? (
            <>
              {" "}
              {t("lastChanged")} <Num.Date value={data.updatedAt} locale={locale} />
            </>
          ) : null}
        </p>

        {!readOnly ? (
          <div className="mt-4 flex justify-end">
            <Button type="submit" form="commission-form" disabled={saving}>
              {saving ? <Spinner /> : null}
              {t("save")}
            </Button>
          </div>
        ) : null}
      </section>

      {!readOnly ? <AgreementProposalsPanel /> : null}
    </div>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-rule-2 pb-3 last:border-b-0 last:pb-0">
      <dt className="text-[13px] text-ink-2">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
