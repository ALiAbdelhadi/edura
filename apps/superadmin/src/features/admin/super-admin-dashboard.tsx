"use client";

import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { StatCardsSkeleton } from "@/components/ui/skeletons";
import { Link } from "@/i18n/navigation";
import { asKey } from "@/lib/i18n/keys";
import { useCustom } from "@refinedev/core";
import { Button } from "@repo/ui/components/button";
import { BarChart } from "@repo/ui/components/charts";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { MetricCard } from "@repo/ui/components/metric-card";
import { Num, ProseCount } from "@repo/ui/components/num";
import type { Locale } from "@repo/ui/lib/format";
import {
  BanknoteArrowDown,
  ClipboardList,
  FileDown,
  Lock,
  RefreshCcw,
  TriangleAlert,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import React from "react";

type DecisionQueue = {
  payouts: {
    count: number;
    total: number;
    oldestAt: string | null;
    oldestBeneficiary: string | null;
  };
  registrations: { centers: number; teachers: number; count: number };
  blocked: { count: number; shortfall: number };
  held: {
    reservedForPayouts: number;
    studentWallets: number;
    refundsInProcessing: number;
    total: number;
  };
  ledger: { day: string; gross: number; commission: number }[];
  lastWrites: {
    id: string;
    ref: string;
    type: string;
    amount: number;
    at: string;
    actor: string | null;
    party: string | null;
  }[];
};

const daysSince = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

export function SuperAdminDashboard() {
  const t = useTranslations("adminHome");
  const locale = useLocale() as Locale;

  const { query, result } = useCustom<DecisionQueue>({
    url: "admin/dashboard/decision-queue",
    method: "get",
  });

  const forms = (k: string) => ({
    one: t(asKey(`${k}_one`)),
    two: t.has(asKey(`${k}_two`)) ? t(asKey(`${k}_two`)) : undefined,
    few: t.has(asKey(`${k}_few`)) ? t(asKey(`${k}_few`)) : undefined,
    many: t(asKey(`${k}_many`)),
  });

  const header = (title: React.ReactNode) => (
    <PageHeader title={title} description={t("today_subtitle")} rule />
  );

  if (query.isLoading) {
    return (
      <div className="flex w-full flex-col gap-6">
        {header(t("today_loading"))}
        <StatCardsSkeleton count={3} />
      </div>
    );
  }

  if (query.isError) {
    const denied = (query.error as { statusCode?: number } | null)?.statusCode === 403;
    return (
      <div className="flex w-full flex-col gap-6">
        {header(t(denied ? "today_deniedTitle" : "today_loadError"))}
        <EmptyState
          tone={denied ? "denied" : "error"}
          icon={TriangleAlert}
          title={t(denied ? "today_deniedTitle" : "today_loadError")}
          description={t(denied ? "today_deniedBody" : "today_loadErrorBody")}
          action={
            denied ? undefined : (
              <Button variant="outline" onClick={() => query.refetch()}>
                <RefreshCcw className="size-4" aria-hidden="true" />
                {t("today_retry")}
              </Button>
            )
          }
        />
      </div>
    );
  }

  const d = result?.data;
  if (!d) return null;

  const open = d.payouts.count + d.registrations.count + d.blocked.count;
  const oldestDays = d.payouts.oldestAt ? daysSince(d.payouts.oldestAt) : null;

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title={
          open > 0 ? (
            <>
              <ProseCount count={open} locale={locale} forms={forms("today_decision")} />{" "}
              {t("today_headlineSuffix")}
            </>
          ) : (
            t("today_allClear")
          )
        }
        description={t("today_subtitle")}
        rule
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/superadmin/reports">
                <FileDown className="size-4" aria-hidden="true" />
                {t("today_cycleStatement")}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/superadmin/payouts">
                <RefreshCcw className="size-4" aria-hidden="true" />
                {t("today_generatePayouts")}
              </Link>
            </Button>
          </div>
        }
      />

      {open > 0 ? (
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard
            href="/dashboard/superadmin/payouts"
            icon={BanknoteArrowDown}
            tone="pending"
            label={t("today_payoutsLabel")}
            meta={
              <Eyebrow locale={locale} script="latin" marker={false}>
                {t("today_payoutsSla")}
              </Eyebrow>
            }
            value={<Num.Figure value={d.payouts.count} locale={locale} />}
            secondary={
              <Num.Money piasters={d.payouts.total} locale={locale} tone="in" sign={false} />
            }
            fact={
              oldestDays !== null ? (
                <>
                  {t("today_oldestRequest")}:{" "}
                  <ProseCount count={oldestDays} locale={locale} forms={forms("today_day")} />
                  {d.payouts.oldestBeneficiary ? <> — {d.payouts.oldestBeneficiary}</> : null}
                </>
              ) : undefined
            }
          />

          <MetricCard
            href="/dashboard/superadmin/registrations"
            icon={ClipboardList}
            tone="neutral"
            label={t("today_registrationsLabel")}
            className={d.blocked.count > 0 ? undefined : "md:col-span-2"}
            value={<Num.Figure value={d.registrations.count} locale={locale} />}
            fact={
              <>
                {d.registrations.centers > 0 ? (
                  <ProseCount
                    count={d.registrations.centers}
                    locale={locale}
                    forms={forms("today_center")}
                  />
                ) : null}
                {d.registrations.centers > 0 && d.registrations.teachers > 0
                  ? ` ${t("today_and")} `
                  : null}
                {d.registrations.teachers > 0 ? (
                  <ProseCount
                    count={d.registrations.teachers}
                    locale={locale}
                    forms={forms("today_teacher")}
                  />
                ) : null}
              </>
            }
          />

          {d.blocked.count > 0 ? (
            <MetricCard
              href="/dashboard/superadmin/payouts"
              icon={Lock}
              tone="attention"
              blocking={t("today_blockedChip")}
              label={t("today_blockedLabel")}
              value={<Num.Figure value={d.blocked.count} locale={locale} />}
              secondary={
                <Num.Money piasters={d.blocked.shortfall} locale={locale} tone="out" />
              }
              fact={t("today_blockedFact")}
            />
          ) : null}
        </div>
      ) : (
        <EmptyState
          tone="empty"
          icon={ClipboardList}
          title={t("today_allClear")}
          description={t("today_allClearBody")}
        />
      )}

      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <LedgerCard data={d} locale={locale} t={t} forms={forms} />
        <HeldFundsCard held={d.held} locale={locale} t={t} />
      </div>

      <LastWritesCard writes={d.lastWrites} locale={locale} t={t} />
    </div>
  );
}

function LedgerCard({
  data,
  locale,
  t,
  forms,
}: {
  data: DecisionQueue;
  locale: Locale;
  t: ReturnType<typeof useTranslations<"adminHome">>;
  forms: (k: string) => { one: string; two?: string; few?: string; many: string };
}) {
  const commission = data.ledger.reduce((s, r) => s + r.commission, 0);
  const gross = data.ledger.reduce((s, r) => s + r.gross, 0);

  return (
    <section className="rounded-xl border border-rule bg-sheet p-5 shadow-[var(--lift)]">
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <Eyebrow locale={locale}>{t("today_ledgerTitle")}</Eyebrow>
        <span className="text-xs text-ink-3">
          {t("today_ledgerWindowPrefix")}{" "}
          <ProseCount count={data.ledger.length} locale={locale} forms={forms("today_day")} />
        </span>
      </header>

      <div className="flex items-stretch gap-6">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-ink-2">{t("today_commission")}</span>
          <Num.Money
            piasters={commission}
            locale={locale}
            tone="in"
            sign={false}
            align="start"
            className="text-[27px] font-semibold text-teal"
          />
        </div>

        <div aria-hidden="true" className="w-px self-stretch bg-rule" />

        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-ink-2">{t("today_grossRevenue")}</span>
          <Num.Money
            piasters={gross}
            locale={locale}
            sign={false}
            align="start"
            className="text-[27px] font-semibold text-ink"
          />
        </div>
      </div>

      <div className="mt-5">
        <BarChart
          height={168}
          data={data.ledger.map((r) => ({
            label: r.day.slice(5),
            gross: r.gross,
            commission: r.commission,
          }))}
          series={[
            { key: "gross", label: t("today_chartGross"), color: "var(--ink-3)" },
            { key: "commission", label: t("today_chartCommission"), color: "var(--teal)" },
          ]}
          yValueFormatter={(v) => formatShort(v, locale)}
          emptyText={t("today_noLedgerYet")}
        />
      </div>
    </section>
  );
}

function formatShort(piasters: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.round(piasters / 100));
}

function HeldFundsCard({
  held,
  locale,
  t,
}: {
  held: DecisionQueue["held"];
  locale: Locale;
  t: ReturnType<typeof useTranslations<"adminHome">>;
}) {
  const rows: { label: string; value: number; tone: "muted" | "out" }[] = [
    { label: t("today_heldReserved"), value: held.reservedForPayouts, tone: "muted" },
    { label: t("today_heldWallets"), value: held.studentWallets, tone: "muted" },
    { label: t("today_heldRefunds"), value: held.refundsInProcessing, tone: "out" },
  ];

  return (
    <section className="rounded-xl border border-rule bg-sheet p-5 shadow-[var(--lift)]">
      <Eyebrow locale={locale} className="mb-2">
        {t("today_heldTitle")}
      </Eyebrow>

      <dl>
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between gap-3 border-b border-rule-2 py-[13px] last:border-b-0"
          >
            <dt className="text-[13px] text-ink-2">{r.label}</dt>
            <dd>
              <Num.Money
                piasters={r.value}
                locale={locale}
                tone={r.tone}
                sign={r.tone === "out"}
              />
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold text-ink">{t("today_heldTotal")}</span>
        <Num.Total piasters={held.total} locale={locale} sign={false} />
      </div>
    </section>
  );
}

function LastWritesCard({
  writes,
  locale,
  t,
}: {
  writes: DecisionQueue["lastWrites"];
  locale: Locale;
  t: ReturnType<typeof useTranslations<"adminHome">>;
}) {
  const TONE: Record<string, "out" | "in" | "muted"> = {
    payout: "out",
    refund: "out",
    commission: "in",
    payment: "in",
    adjustment: "muted",
  };

  return (
    <section className="overflow-hidden rounded-xl border border-rule bg-sheet shadow-[var(--lift)]">
      <header className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3">
        <Eyebrow locale={locale}>{t("today_lastWritesTitle")}</Eyebrow>
        <Link
          href="/dashboard/superadmin/audit"
          className="focus-ledger rounded text-xs text-indigo hover:underline"
        >
          {t("today_lastWritesLink")}
        </Link>
      </header>

      {writes.length === 0 ? (
        <p className="px-5 py-6 text-center text-[13px] text-ink-3">{t("today_noWrites")}</p>
      ) : (
        <ul>
          {writes.map((w) => (
            <li
              key={w.id}
              className="flex items-center gap-4 border-b border-rule-2 px-5 py-[11px] last:border-b-0"
            >
              <span className="flex shrink-0 items-baseline gap-1.5">
                <Num.Code>{w.ref}</Num.Code>
                <span aria-hidden="true" className="text-ink-3">
                  ·
                </span>
                <Num.Date
                  value={w.at}
                  locale={locale}
                  options={{ hour: "2-digit", minute: "2-digit" }}
                  className="text-[11px] text-ink-3"
                />
              </span>

              <span className="shrink-0 text-[13px] text-ink">
                {t(asKey(`today_txType_${w.type}`))}
              </span>

              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
                {w.party ?? ""}
              </span>

              <span className="shrink-0 text-xs text-ink-3">
                {t("today_by")} {w.actor ?? t("today_system")}
              </span>

              <Num.Money
                piasters={w.amount}
                locale={locale}
                tone={TONE[w.type] ?? "muted"}
                className="shrink-0"
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
