"use client";

import { useCustom } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { Num } from "@repo/ui/components/num";
import { toast } from "@repo/ui/components/sonner";
import { formatPercent, type Locale } from "@repo/ui/lib/format";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { Spinner } from "@/components/kit/spinner";
import { asKey } from "@/lib/i18n/keys";
import { useAction } from "@/lib/api/use-action";
import { useState } from "react";

type Proposal = {
  id: string;
  centerId: string;
  teacherId: string;
  basis: "percent_of_net" | "fixed_per_student";
  rateBp: number | null;
  rateFlat: number | null;
  residual: "teacher" | "center";
  note: string | null;
  createdAt: string;
};

type AgreementStatus = "proposed" | "active" | "ended";
const STATUSES: readonly AgreementStatus[] = ["proposed", "active", "ended"];

export function AgreementProposalsPanel() {
  const t = useTranslations("agreements");
  const queryStrings = useQueryStrings();
  const locale = useLocale() as Locale;
  // Same table, three lives: a `proposed` row is decided, an `active` one is
  // ended. Terminate had no surface because the panel only ever asked for
  // proposals.
  const [status, setStatus] = useState<AgreementStatus>("proposed");
  const { query, result } = useCustom({
    url: "admin/teacher-agreements",
    method: "get",
    config: { query: { status } },
  });
  const { run, busyKey: busyId } = useAction({
    onSuccess: () => query.refetch(),
  });

  const rows = ((result as { data?: Proposal[] })?.data ?? []) as Proposal[];

  const act = (id: string, action: "approve" | "reject" | "terminate") =>
    run({
      url: `admin/teacher-agreements/${id}/${action}`,
      values: {},
      key: id,
      successMsg:
        action === "approve"
          ? t("approved")
          : action === "reject"
            ? t("rejected")
            : t("terminated"),
    });

  return (
    <section className="rounded-xl border border-rule bg-sheet p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow locale={locale}>{t("queueTitle")}</Eyebrow>
        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={
                status === s
                  ? "focus-ledger rounded-lg border border-indigo bg-indigo-soft px-2.5 py-1 text-[12px] font-semibold text-indigo"
                  : "focus-ledger rounded-lg border border-rule px-2.5 py-1 text-[12px] text-ink-2 hover:bg-rule-2"
              }
            >
              {t(asKey(`agreementStatus_${s}`))}
            </button>
          ))}
        </div>
      </div>
      {query.isLoading ? (
        <div className="mt-3">
          <Spinner />
        </div>
      ) : query.isError ? (
        <LoadError
          className="mt-3"
          message={queryStrings.loadFailed}
          onRetry={() => query.refetch()}
          retryLabel={queryStrings.retry}
        />
      ) : rows.length === 0 ? (
        <p className="m-0 mt-2 text-[13px] text-ink-2">{t("queueEmpty")}</p>
      ) : (
        <div className="mt-3 flex flex-col">
          {rows.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-2 border-b border-rule-2 py-3 first:pt-0 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="m-0 text-[13px] font-medium text-ink">
                  {p.basis === "percent_of_net"
                    ? t("percentLine", {
                        rate: formatPercent((p.rateBp ?? 0) / 10000, locale),
                        side: p.residual === "center" ? t("sideTeacher") : t("sideCenter"),
                      })
                    : t("fixedLine", {
                        side: p.residual === "center" ? t("sideTeacher") : t("sideCenter"),
                      })}
                  {p.basis === "fixed_per_student" ? (
                    <Num.Money piasters={p.rateFlat ?? 0} locale={locale} sign={false} />
                  ) : null}
                </p>
                <p className="m-0 mt-0.5 text-[11.5px] text-ink-3">
                  <Num.Date value={p.createdAt} locale={locale} options={{ dateStyle: "medium" }} />
                  {p.note ? ` — ${p.note}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {status === "proposed" ? (
                  <>
                    <Button size="sm" disabled={busyId === p.id} onClick={() => void act(p.id, "approve")}>
                      {t("approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === p.id}
                      onClick={() => void act(p.id, "reject")}
                    >
                      {t("reject")}
                    </Button>
                  </>
                ) : status === "active" ? (
                  <ConfirmDialog
                    trigger={
                      <Button size="sm" variant="outline" className="border-red text-red hover:bg-red-soft" disabled={busyId === p.id}>
                        {t("terminate")}
                      </Button>
                    }
                    destructive
                    title={t("terminateTitle")}
                    description={t("terminateBody")}
                    confirmText={t("terminate")}
                    onConfirm={async () => {
                      const res = await act(p.id, "terminate");
                      if (!res.ok) throw res.error;
                    }}
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
