"use client";

import { useEffect, useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { Infinity as InfinityIcon, Wallet } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { Input } from "@repo/ui/components/input";
import { Num } from "@repo/ui/components/num";
import { toast } from "@repo/ui/components/sonner";
import type { Locale } from "@repo/ui/lib/format";

import { PageHeader } from "@/components/kit/page-header";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { PageSpinner, Spinner } from "@/components/kit/spinner";

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
  const { mutateAsync: save } = useCustomMutation();

  const data = result?.data as WalletPolicy | undefined;

  const [minEgp, setMinEgp] = useState("");
  const [maxEgp, setMaxEgp] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setMinEgp(String(data.minTopup / 100));
      setMaxEgp(String(data.maxTopup / 100));
    }
  }, [data]);

  const submit = async () => {
    const min = Number(minEgp);
    const max = Number(maxEgp);
    if (!Number.isFinite(min) || min <= 0 || !Number.isFinite(max) || max <= 0) {
      toast.error(t("positiveError"));
      return;
    }
    if (max < min) {
      toast.error(t("orderError"));
      return;
    }
    setSaving(true);
    try {
      await save({
        url: "admin/wallet-settings",
        method: "put",
        values: { minTopup: Math.round(min * 100), maxTopup: Math.round(max * 100) },
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="min-topup" className="mb-1 block text-[13px] font-medium text-ink">
              {t("min")}
            </label>
            <Input
              id="min-topup"
              type="number"
              min="0"
              step="0.01"
              value={minEgp}
              onChange={(e) => setMinEgp(e.target.value)}
            />
            <p className="mt-1 text-xs text-ink-3">
              {t("minHint")}{" "}
              <Num.Money piasters={data.minTopup} locale={locale} sign={false} />
            </p>
          </div>

          <div>
            <label htmlFor="max-topup" className="mb-1 block text-[13px] font-medium text-ink">
              {t("max")}
            </label>
            <Input
              id="max-topup"
              type="number"
              min="0"
              step="0.01"
              value={maxEgp}
              onChange={(e) => setMaxEgp(e.target.value)}
            />
            <p className="mt-1 text-xs text-ink-3">
              {t("maxHint")}{" "}
              <Num.Money piasters={data.maxTopup} locale={locale} sign={false} />
            </p>
          </div>
        </div>

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
          <Button onClick={submit} disabled={saving}>
            {saving ? <Spinner /> : null}
            {t("save")}
          </Button>
        </div>
      </section>
    </div>
  );
}
