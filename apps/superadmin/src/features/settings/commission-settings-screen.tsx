"use client";

import { useEffect, useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { Info, Percent } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { Input } from "@repo/ui/components/input";
import { Num } from "@repo/ui/components/num";
import { toast } from "@repo/ui/components/sonner";
import { formatPercent, type Locale } from "@repo/ui/lib/format";

import { PageHeader } from "@/components/kit/page-header";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
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
  const { mutateAsync: save } = useCustomMutation();

  const data = result?.data as CommissionData | undefined;

  const [pct, setPct] = useState("");
  const [teacherFeeEgp, setTeacherFeeEgp] = useState("");
  const [centerFeeEgp, setCenterFeeEgp] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setPct(String(data.teacherDirectCommissionBp / 100));
      setTeacherFeeEgp(String(data.platformTeacherFee / 100));
      setCenterFeeEgp(String(data.platformCenterFee / 100));
    }
  }, [data]);

  const submit = async () => {
    const pctNum = Number(pct);
    const tFee = Number(teacherFeeEgp);
    const cFee = Number(centerFeeEgp);
    if (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100) {
      toast.error(t("pctError"));
      return;
    }
    if (!Number.isFinite(tFee) || tFee < 0 || !Number.isFinite(cFee) || cFee < 0) {
      toast.error(t("feeError"));
      return;
    }
    setSaving(true);
    try {
      await save({
        url: "admin/commission-settings",
        method: "put",
        values: {
          teacherDirectCommissionBp: Math.round(pctNum * 100),
          platformTeacherFee: Math.round(tFee * 100),
          platformCenterFee: Math.round(cFee * 100),
        },
      });
      toast.success(t("savedOk"));
      void query.refetch();
    } catch {
      toast.error(t("saveFail"));
    } finally {
      setSaving(false);
    }
  };

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
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="commission-pct" className="mb-1 block text-[13px] font-medium text-ink">
                {t("pct")}
              </label>
              <Input
                id="commission-pct"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
              />
              <p className="mt-1 text-xs text-ink-3">{t("pctHint")}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="platform-fee-teacher"
                  className="mb-1 block text-[13px] font-medium text-ink"
                >
                  {t("teacherFee")}
                </label>
                <Input
                  id="platform-fee-teacher"
                  type="number"
                  min="0"
                  step="0.01"
                  value={teacherFeeEgp}
                  onChange={(e) => setTeacherFeeEgp(e.target.value)}
                />
              </div>
              <div>
                <label
                  htmlFor="platform-fee-center"
                  className="mb-1 block text-[13px] font-medium text-ink"
                >
                  {t("centerFee")}
                </label>
                <Input
                  id="platform-fee-center"
                  type="number"
                  min="0"
                  step="0.01"
                  value={centerFeeEgp}
                  onChange={(e) => setCenterFeeEgp(e.target.value)}
                />
              </div>
            </div>
          </div>
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
            <Button onClick={submit} disabled={saving}>
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
