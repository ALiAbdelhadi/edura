"use client";

import { useCustom, useCustomMutation, useInvalidate } from "@refinedev/core";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { TwoStepCommit } from "@repo/ui/components/confirm-dialog";
import { LimitNote } from "@repo/ui/components/ledger";
import { Num } from "@repo/ui/components/num";
import { toast } from "@repo/ui/components/sonner";
import type { Locale } from "@repo/ui/lib/format";
import { cn } from "@repo/ui/lib/utils";
import { useLocale, useTranslations } from "next-intl";

type Preview = {
  courseTitle: string | null;
  alreadySettled: boolean;
  settledAt: string | null;
  cancelled: boolean;
  unpriced: boolean;
  nothingToSettle: boolean;
  counterOnlyCount?: number;
  platformHeldGross?: number;
  centerHeldGross?: number;
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
      toast.error((e as { message?: string })?.message || t("teacher.settleError"));
    }
  };

  const actionable =
    !!p &&
    !p.isTeacherDirect &&
    !p.cancelled &&
    !p.alreadySettled &&
    !p.nothingToSettle &&
    !p.unpriced &&
    !p.feeExceedsPrice;

  const body = () => {
    if (query.isLoading || !p) {
      return (
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded-2xl bg-field" />
          <div className="h-32 animate-pulse rounded-2xl bg-field" />
          <div className="h-12 animate-pulse rounded-xl bg-field" />
        </div>
      );
    }

    if (p.isTeacherDirect) {
      return (
        <LimitNote className="rounded-2xl border border-indigo/15 bg-indigo-soft/40 px-4 py-4">
          {t("teacher.settleTeacherDirect")}
        </LimitNote>
      );
    }

    if (p.cancelled) {
      return (
        <LimitNote className="rounded-2xl border border-red/15 bg-red-soft/40 px-4 py-4">
          {t("teacher.settleCancelled")}
        </LimitNote>
      );
    }

    if (p.alreadySettled) {
      return (
        <LimitNote className="rounded-2xl border border-teal/15 bg-teal-soft/40 px-4 py-4">
          {t("teacher.settleAlready")}{" "}
          {p.settledAt ? (
            <Num.Date value={p.settledAt} locale={locale} />
          ) : null}
        </LimitNote>
      );
    }

    if (p.nothingToSettle) {
      return (
        <LimitNote className="rounded-2xl border border-amber/15 bg-amber-soft/40 px-4 py-4">
          {t("teacher.settleNoPresent")}
        </LimitNote>
      );
    }

    if (p.unpriced) {
      return (
        <LimitNote className="rounded-2xl border border-amber/15 bg-amber-soft/40 px-4 py-4">
          {t("teacher.settleUnpriced")}
        </LimitNote>
      );
    }

    if (p.feeExceedsPrice) {
      return (
        <LimitNote className="rounded-2xl border border-red/15 bg-red-soft/40 px-4 py-4">
          {t("teacher.settleFeeExceeds")}
        </LimitNote>
      );
    }

    const fundingNote =
      (p.centerHeldGross ?? 0) > 0 ? (
        <p className="mt-2 mb-0 flex flex-wrap items-baseline gap-1 text-[12.5px] leading-relaxed text-ink-2">
          <span>{t("teacher.settleCenterHeldNote")}</span>
          <Num.Money piasters={p.centerHeldGross ?? 0} locale={locale} sign={false} />
        </p>
      ) : null;

    const counterOnlyNote =
      (p.counterOnlyCount ?? 0) > 0 ? (
        <LimitNote className="mb-3 rounded-2xl border border-amber/15 bg-amber-soft/40 px-4 py-3">
          {t("teacher.settleCounterOnlyWarning", { n: p.counterOnlyCount ?? 0 })}
        </LimitNote>
      ) : null;

    const row = (label: string, value: number, emphasized = false) => (
      <div className="flex items-center justify-between gap-4 py-2">
        <span
          className={cn(
            "text-[13px]",
            emphasized ? "font-medium text-ink" : "text-ink-2",
          )}
        >
          {label}
        </span>

        <Num.Money
          piasters={value}
          locale={locale}
          sign={false}
        />
      </div>
    );

    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-border/70 bg-sheet p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow mb-1">
                {t("teacher.settleTeacherTotal")}
              </p>

              <div className="text-[30px] font-semibold tracking-tight text-ink">
                <Num.Money
                  piasters={p.total?.teacher ?? 0}
                  locale={locale}
                  sign={false}
                />
              </div>

              <p className="mt-1 text-xs text-ink-3">
                {p.courseTitle}
              </p>
            </div>

            <div className="rounded-full bg-teal-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-teal">
              {t("teacher.settleAction", {
                amount: ((p.total?.gross ?? 0) / 100).toFixed(2),
                n: p.presentCount,
              })}
            </div>
          </div>

          {counterOnlyNote}
          {fundingNote}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-field px-3.5 py-3">
              <p className="text-[11px] text-ink-3">
                {t("teacher.settlePresent")}
              </p>
              <div className="mt-1 text-lg font-semibold text-ink">
                <Num.Figure
                  value={p.presentCount}
                  locale={locale}
                />
              </div>
            </div>

            <div className="rounded-xl bg-field px-3.5 py-3">
              <p className="text-[11px] text-ink-3">
                {t("teacher.settleLessonPrice")}
              </p>

              <div className="mt-1 text-lg font-semibold text-ink">
                <Num.Money
                  piasters={p.perSessionPrice}
                  locale={locale}
                  sign={false}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-sheet px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="eyebrow">
              {t("teacher.settlePerStudent")}
            </p>

            <span className="text-[11px] text-ink-3">
              {t("teacher.settlePresent")}
            </span>
          </div>

          {row(
            t("teacher.settleTeacherShare"),
            p.perStudent?.teacher ?? 0,
            true,
          )}

          {row(
            t("teacher.settleCenterShare"),
            p.perStudent?.center ?? 0,
          )}

          {row(
            t("teacher.settlePlatformShare"),
            p.perStudent?.platform ?? 0,
          )}
        </div>

        <div className="rounded-2xl bg-ink px-4 py-4 text-white">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-white/70">
              {t("teacher.settleTeacherTotal")}
            </span>

            <div className="text-xl font-semibold tracking-tight">
              <Num.Money
                piasters={p.total?.teacher ?? 0}
                locale={locale}
                sign={false}
              />
            </div>
          </div>
        </div>

        <TwoStepCommit
          resetKey={sessionId}
          busy={mutation.isPending}
          onCommit={commit}
          labels={{
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
        <CardDescription>{t("teacher.settleSubtitle")}</CardDescription>
        {actionable ? (
          <CardAction>
            <span className="mt-1.5 block size-2 rounded-full bg-amber" aria-hidden />
            <span className="sr-only">{t("teacher.settlePendingLabel")}</span>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>{body()}</CardContent>
    </Card>
  );
}
