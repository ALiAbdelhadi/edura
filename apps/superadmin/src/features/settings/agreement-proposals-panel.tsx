"use client";

import { useCustom, useCustomMutation } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { Num } from "@repo/ui/components/num";
import { toast } from "@repo/ui/components/sonner";
import { formatPercent, type Locale } from "@repo/ui/lib/format";
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

export function AgreementProposalsPanel() {
  const t = useTranslations("agreements");
  const locale = useLocale() as Locale;
  const { query, result } = useCustom({ url: "admin/teacher-agreements", method: "get" });
  const { mutateAsync } = useCustomMutation();
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = ((result as { data?: Proposal[] })?.data ?? []) as Proposal[];

  const act = async (id: string, action: "approve" | "reject") => {
    setBusyId(id);
    try {
      await mutateAsync({ url: `admin/teacher-agreements/${id}/${action}`, method: "post", values: {} });
      toast.success(action === "approve" ? t("approved") : t("rejected"));
      query.refetch();
    } catch (err) {
      toast.error((err as { message?: string })?.message || t("failed"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-xl border border-rule bg-sheet p-5">
      <Eyebrow locale={locale}>{t("queueTitle")}</Eyebrow>
      {rows.length === 0 ? (
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
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
