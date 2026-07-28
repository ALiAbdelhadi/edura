"use client";

/* اليوم / Today — the platform decision queue.
   ══════════════════════════════════════════════════════════════════════════════

   WHAT THE SYSTEM GUARANTEES HERE: every figure on this screen is derived from an
   append-only ledger the operator cannot edit, and each card fronts a queue whose
   items become permanent the moment they are approved.

   WHAT THE INTERFACE MUST DO TO BE HONEST ABOUT IT: lead with the decisions, not the
   totals; show what is waiting and how long it has waited; and never display a figure
   that is not traceable to a table. The screen it replaces was seven near-identical
   stat cards — it knew there were pending registrations and said nothing about them.

   ── One deliberate departure from the design brief ───────────────────────────

   Handoff §5.1 specifies a third metric card, «فروق في مطابقة الكاش» (cash
   reconciliation differences). THAT CONCEPT DOES NOT EXIST: 70 models in
   schema.prisma, none for reconciliation discrepancies. Building it would have failed
   the one test the constitution exists to enforce — "no screen implies a capability
   the system does not have" (§8).

   The card was replaced, not dropped, by deriving from a real guarantee. settlePayout
   settles through an H2 CONDITIONAL DECREMENT, so a payout whose beneficiary wallet
   does not cover the net cannot be disbursed — it throws and rolls back. That is a
   genuine blocking condition, knowable before the operator commits, and it carries
   exactly the «يوقف الصرف» meaning the card was drawn to carry. See the note in
   lib/services/admin/platform-dashboard.ts. */

import React from "react";
import { useCustom } from "@refinedev/core";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  BanknoteArrowDown,
  ClipboardList,
  FileDown,
  Lock,
  RefreshCcw,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { MetricCard } from "@repo/ui/components/metric-card";
import { Num, ProseCount } from "@repo/ui/components/num";
import { BarChart } from "@repo/ui/components/charts";
import type { Locale } from "@repo/ui/lib/format";

import { PageHeader } from "@/components/kit/page-header";
import { EmptyState } from "@/components/kit/empty-state";
import { StatCardsSkeleton } from "@/components/ui/skeletons";
import { asKey } from "@/lib/i18n/keys";

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

  /* The dual (`_two`) and small-plural (`_few`) forms exist in Arabic ONLY — English
     has neither, and `pluralForm` ignores both outside `ar`. `Messages` is typed from
     the English dictionary, so those keys are legitimately absent from the type;
     `asKey` is this codebase's existing escape hatch for exactly that case. */
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
    // Not "nothing is waiting on you" — that is a CLAIM, and we do not yet know it.
    return (
      <div className="flex w-full flex-col gap-6">
        {header(t("today_loading"))}
        <StatCardsSkeleton count={3} />
      </div>
    );
  }

  /* Empty, error and permission-denied are THREE DIFFERENT TRUTHS. Telling an
     operator "nothing is waiting" when the request failed, or offering them a Retry
     button for a permission they will never have, are both lies about the data —
     which is why <EmptyState tone> distinguishes them and why the 403 is split out
     here rather than folded into the generic error. */
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
          // No Retry on a 403 — retrying cannot change a permission.
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

      {/* Ordered by urgency, each a link — every card is the door to its queue. */}
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

          {/* The real blocking condition — see the header note. */}
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

/* ── دفتر المنصة ───────────────────────────────────────────────────────────────
   Two figures the operator is expected to reconcile against each other, then the
   daily shape behind them. Nothing is pre-summed: the commission and the gross it
   was taken from are both shown, because a total the user cannot derive is a total
   they must trust blindly. */
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

/* ── أموال محتجزة الآن ─────────────────────────────────────────────────────────
   A real reconciliation list closing on a double-rule total. The double rule is the
   accountant's convention for "this line is a conclusion, not another row" — and it
   is honest here precisely because every component of the sum is printed above it. */
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

/* ── آخر ما كُتب في الدفتر ─────────────────────────────────────────────────────
   The app's honesty: every screen's actions land here. The actor is never blank —
   an unattributed write in an audited system is a gap the interface should not
   create, so an automated write reads «النظام». */
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
              {/* Two separate isolated runs with the separator rendered between them —
                  never typed into copy, and never sliced out of an ISO string, which
                  would have printed UTC while claiming to be the time of the write. */}
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
