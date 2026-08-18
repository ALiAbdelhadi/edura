"use client";

/**
 * SETTLE THE LESSON — the trigger for the whole money engine, finally reachable
 * from the product.
 *
 * Until now `POST /api/v1/sessions/[id]/complete` had NO caller in apps/www at
 * all: the only surface that could settle a lesson was the back office's
 * center-oversight tab, and no cron did it either. So a center could take cash
 * and mark attendance, and the teacher's wallet stayed empty until someone at
 * Edura opened the back office and closed the lesson by hand, one at a time.
 *
 * Everything shown here comes from `GET .../settlement-preview`, which runs the
 * SAME `resolveLessonPrice` / `resolveLessonEconomics` / `computeLessonSplit`
 * the settlement itself runs. Nothing on this screen re-derives money — the
 * button quotes the ledger's own arithmetic (`design/CONSTITUTION.md` §1: the
 * button carries its own amount, every intermediate figure is shown).
 */

import { useCustom, useCustomMutation, useInvalidate } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Num } from "@repo/ui/components/num";
import { TwoStepCommit } from "@repo/ui/components/confirm-dialog";
import { LimitNote, TotalLine } from "@repo/ui/components/ledger";
import { PageSpinner } from "@/components/kit/spinner";
import { toast } from "@repo/ui/components/sonner";
import type { Locale } from "@repo/ui/lib/format";

type Preview = {
  courseTitle: string | null;
  alreadySettled: boolean;
  settledAt: string | null;
  cancelled: boolean;
  unpriced: boolean;
  nothingToSettle: boolean;
  feeExceedsPrice: boolean;
  isTeacherDirect: boolean;
  presentCount: number;
  perSessionPrice: number;
  perStudent: { platform: number; center: number; teacher: number } | null;
  total: { platform: number; center: number; teacher: number; gross: number } | null;
};

export function SettleLessonCard({ sessionId }: { sessionId: string }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const invalidate = useInvalidate();
  const { mutateAsync, mutation } = useCustomMutation();

  const { query, result } = useCustom<Preview>({
    url: `sessions/${sessionId}/settlement-preview`,
    method: "get",
    queryOptions: { enabled: !!sessionId },
  });
  const p = result?.data;

  const commit = async () => {
    try {
      await mutateAsync({ url: `sessions/${sessionId}/complete`, method: "post", values: {} });
      toast.success(t("teacher.settleDone"));
      await query.refetch();
      invalidate({ resource: "sessions", invalidates: ["list"] });
    } catch (e) {
      // The server owns every refusal (unpriced, already settled, fee > price),
      // so its message is shown verbatim rather than re-worded here.
      toast.error((e as { message?: string })?.message || t("teacher.settleError"));
    }
  };

  const body = () => {
    if (query.isLoading || !p) return <PageSpinner />;

    // Each of these is a reason there is nothing to press — stated as prose,
    // never as a disabled button the reader has to interrogate.
    if (p.isTeacherDirect) return <LimitNote>{t("teacher.settleTeacherDirect")}</LimitNote>;
    if (p.cancelled) return <LimitNote>{t("teacher.settleCancelled")}</LimitNote>;
    if (p.alreadySettled) {
      return (
        <LimitNote>
          {t("teacher.settleAlready")}{" "}
          {p.settledAt ? <Num.Date value={p.settledAt} locale={locale} /> : null}
        </LimitNote>
      );
    }
    if (p.nothingToSettle) return <LimitNote>{t("teacher.settleNoPresent")}</LimitNote>;
    if (p.unpriced) return <LimitNote>{t("teacher.settleUnpriced")}</LimitNote>;
    if (p.feeExceedsPrice) return <LimitNote>{t("teacher.settleFeeExceeds")}</LimitNote>;

    const row = (label: string, value: number) => (
      <div className="flex items-baseline justify-between gap-4 py-1">
        <span className="text-[13px] text-ink-2">{label}</span>
        <Num.Money piasters={value} locale={locale} sign={false} />
      </div>
    );

    return (
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-4 py-1">
          <span className="text-[13px] text-ink-2">{t("teacher.settlePresent")}</span>
          <Num.Figure value={p.presentCount} locale={locale} />
        </div>
        {row(t("teacher.settleLessonPrice"), p.perSessionPrice)}

        <div className="border-t border-rule pt-2">
          <p className="eyebrow mb-1">{t("teacher.settlePerStudent")}</p>
          {row(t("teacher.settleTeacherShare"), p.perStudent?.teacher ?? 0)}
          {row(t("teacher.settleCenterShare"), p.perStudent?.center ?? 0)}
          {row(t("teacher.settlePlatformShare"), p.perStudent?.platform ?? 0)}
        </div>

        <TotalLine
          label={t("teacher.settleTeacherTotal")}
          value={
            <Num.Money piasters={p.total?.teacher ?? 0} locale={locale} sign={false} />
          }
        />

        <TwoStepCommit
          resetKey={sessionId}
          busy={mutation.isPending}
          onCommit={commit}
          labels={{
            // The amount the teacher is authorising, not a category of action.
            action: t("teacher.settleAction", {
              amount: ((p.total?.gross ?? 0) / 100).toFixed(2),
              n: p.presentCount,
            }),
            confirm: t("teacher.settleConfirm"),
            hint: t("teacher.settleHint"),
            armedHint: t("teacher.settleArmedHint"),
            armedAnnouncement: t("teacher.settleConfirm"),
          }}
        />
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("teacher.settleTitle")}</CardTitle>
      </CardHeader>
      <CardContent>{body()}</CardContent>
    </Card>
  );
}
