"use client";

import { useCustom } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PageSpinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { asArray } from "@/lib/refine/as-array";
import {
  Hairline,
  InitialsTile,
  LedgerButton,
  LedgerEmpty,
  Money,
  Num,
  PageTitle,
  SectionHeading,
  Sheet,
} from "@/components/ledger";
import { isLive, stateOf, type SubscriptionRow } from "./subscription-state";
import { SubscriptionStateChip, useCoverageWords } from "./subscription-state-chip";

function SubscriptionRowView({
  sub,
  renewHref,
}: {
  sub: SubscriptionRow;
  renewHref: string;
}) {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const words = useCoverageWords();

  const state = stateOf(sub);
  const coverage = words(state);
  const title = sub.course?.title ?? t("studentClass.tbd");
  const needsRenewal = state.kind === "expiring" || state.kind === "lapsed";

  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <InitialsTile name={title} size={34} tone={isLive(state) ? "teal" : "indigo"} />
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug" style={{ color: "var(--ink)" }}>
            {title}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>
            {sub.plan === "monthly"
              ? t("shared.subscriptions.planMonthly")
              : t("shared.subscriptions.planSession")}
            {" · "}

            {sub.plan === "per_session" ? (
              t("shared.subscriptions.noWindow")
            ) : sub.periodEnd ? (
              <>
                {t("shared.subscriptions.endsOn")}{" "}
                {formatDate(sub.periodEnd, { day: "numeric", month: "long" })}
              </>
            ) : (
              t("shared.subscriptions.notStarted")
            )}
          </p>
          {coverage ? (
            <p className="mt-1 text-xs" style={{ color: "var(--ink-2)" }}>
              {coverage}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
        <div className="flex items-center gap-2">
          <SubscriptionStateChip state={state} />
          <Money piasters={sub.price} tone="ink" weight={600} />
        </div>
        {needsRenewal ? (
          <LedgerButton variant="primary" asChild>
            <Link href={renewHref}>{t("shared.subscriptions.renew")}</Link>
          </LedgerButton>
        ) : null}
      </div>
    </div>
  );
}

export function SubscriptionsScreen({
  studentId,
  title,
  subtitle,
  emptyTitle,
  emptyHint,
  emptyCta,
  renewHref,
}: {
  studentId?: string;
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyHint: string;
  emptyCta: string;
  renewHref: string;
}) {
  const t = useTranslations();
  const { query, result } = useCustom({
    url: studentId ? `me/subscriptions?studentId=${studentId}` : "me/subscriptions",
    method: "get",
  });

  const subs = asArray<SubscriptionRow>(result?.data);

  if (query.isLoading) return <PageSpinner label={t("common.loading")} />;

  const live = subs.filter((s) => isLive(stateOf(s)));
  const past = subs.filter((s) => !isLive(stateOf(s)));

  return (
    <div className="space-y-6">
      <PageTitle title={title} subtitle={subtitle} />

      <Sheet className="p-5">
        <SectionHeading
          title={t("shared.subscriptions.sectionActive")}
          action={
            live.length > 0 ? (
              <Num style={{ color: "var(--ink-3)", fontSize: 13 }}>{live.length}</Num>
            ) : null
          }
        />
        <div className="mt-3">
          {live.length === 0 ? (
            <LedgerEmpty
              title={emptyTitle}
              hint={emptyHint}
              action={
                <LedgerButton variant="primary" asChild>
                  <Link href={renewHref}>{emptyCta}</Link>
                </LedgerButton>
              }
            />
          ) : (
            <ul>
              {live.map((sub, i) => (
                <li key={sub.id}>
                  {i > 0 ? <Hairline /> : null}
                  <SubscriptionRowView sub={sub} renewHref={renewHref} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>

      {past.length > 0 ? (
        <Sheet className="p-5">
          <SectionHeading
            title={t("shared.subscriptions.sectionPast")}
            action={
              <Num style={{ color: "var(--ink-3)", fontSize: 13 }}>{past.length}</Num>
            }
          />
          <div className="mt-3">
            <ul>
              {past.map((sub, i) => (
                <li key={sub.id}>
                  {i > 0 ? <Hairline /> : null}
                  <SubscriptionRowView sub={sub} renewHref={renewHref} />
                </li>
              ))}
            </ul>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
