"use client";

import { Fragment, useState } from "react";
import { useCustom } from "@refinedev/core";
import { todayKey } from "@repo/shared/date-key";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Lock, ScrollText } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { Num } from "@repo/ui/components/num";
import { StatusBadge } from "@repo/ui/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { formatDate, type Locale } from "@repo/ui/lib/format";

import { ListFilter, ListShell, ListTextFilter } from "@/components/kit/list-shell";
import { PageHeader } from "@/components/kit/page-header";
import { useCustomListScreen } from "@/lib/api/use-list-screen";
import { asKey } from "@/lib/i18n/keys";

type Row = {
  id: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  targetType: string | null;
  targetId: string | null;
  centerId: string | null;
  beforeState: unknown;
  afterState: unknown;
  onBehalfOf: string | null;
  onBehalfOfName: string | null;
  createdAt: string;
};

const dayKey = (iso: string) => iso.slice(0, 10);

export function AuditLogTable({ fixedCenterId }: { fixedCenterId?: string }) {
  const t = useTranslations("auditLog");
  const tRole = useTranslations("roles");
  const locale = useLocale() as Locale;
  const [expanded, setExpanded] = useState<string | null>(null);

  // The distinct action vocabulary, so filtering does not require the
  // operator to know that the string is "center.counter_checkin" exactly.
  const actionsQ = useCustom<string[]>({ url: "admin/audit-logs/actions", method: "get" });
  const actions = (() => {
    const d = actionsQ.result?.data as unknown;
    return Array.isArray(d) ? (d as string[]) : [];
  })();

  const list = useCustomListScreen<Row>({
    url: "admin/audit-logs",
    pageSize: 50,
    // Both filters are typed, so they trail the keystrokes instead of firing
    // a full-ledger query per character.
    textFilters: ["action", "targetId"],
    extraQuery: fixedCenterId ? { centerId: fixedCenterId } : undefined,
    select: (data) => {
      const d = data as { data?: Row[]; total?: number } | undefined;
      return { rows: d?.data ?? [], total: d?.total ?? 0 };
    },
  });

  const days: { day: string; rows: Row[] }[] = [];
  for (const r of list.rows) {
    const k = dayKey(r.createdAt);
    const last = days.at(-1);
    if (last && last.day === k) last.rows.push(r);
    else days.push({ day: k, rows: [r] });
  }

  // Snapshot the clock ONCE at mount rather than reading it inside the render
  // body. `Date.now()` there is non-idempotent -- React may re-render at any
  // moment, and a screen left open across midnight would relabel rows mid-pass,
  // so one render could call the same day both "today" and "yesterday".
  const [{ today, yesterday }] = useState(() => ({
    today: todayKey(),
    yesterday: todayKey(new Date(Date.now() - 86_400_000)),
  }));

  const dayLabel = (day: string) => {
    if (day === today) return t("today");
    if (day === yesterday) return t("yesterday");
    return formatDate(day, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };

  return (
    <ListShell
      list={list}
      toolbar={
        <>
          {actions.length > 0 ? (
            <ListFilter
              list={list}
              name="action"
              anyLabel={t("filterActionAny")}
              options={actions}
              render={(a) => a}
            />
          ) : null}
          <ListTextFilter
            list={list}
            name="action"
            label={t("filterAction")}
            placeholder={t("filterActionPlaceholder")}
            dir="ltr"
          />
          <ListTextFilter
            list={list}
            name="targetId"
            label={t("filterTarget")}
            placeholder={t("filterTargetPlaceholder")}
            className="w-72"
            dir="ltr"
          />
          <span className="ms-auto flex items-baseline gap-1.5 text-[13px] text-ink-2">
            <Num.Figure value={list.total} locale={locale} />
            {t("entries")}
          </span>
        </>
      }
      emptyIcon={ScrollText}
      emptyTitle={t("empty")}
      emptyDescription={t("emptyBody")}
      errorTitle={t("loadError")}
      errorDescription={t("loadErrorBody")}
      deniedTitle={t("deniedTitle")}
      deniedDescription={t("deniedBody")}
      // The ledger reads as a diary: rows group under the day they happened on,
      // and each opens in place. Neither shape survives a flat DataTable.
      body={
        <div className="overflow-x-auto rounded-xl border border-rule bg-sheet shadow-[var(--lift)]">
          <Table>
            <TableHeader>
              <TableRow className="border-rule bg-field hover:bg-field">
                <TableHead className="h-[34px] w-8 px-3">
                  <span className="sr-only">{t("expand")}</span>
                </TableHead>
                {(["colWhen", "colWho", "colAction", "colTarget"] as const).map((c) => (
                  <TableHead key={c} className="h-[34px] px-3">
                    <Eyebrow locale={locale} marker={false}>
                      {t(c)}
                    </Eyebrow>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.map(({ day, rows: dayRows }) => (
                <Fragment key={day}>
                  <TableRow className="border-rule-2 hover:bg-transparent">
                    <TableCell colSpan={5} className="sticky top-0 z-10 bg-field px-3 py-1.5">
                      <Eyebrow locale={locale}>{dayLabel(day)}</Eyebrow>
                    </TableCell>
                  </TableRow>

                  {dayRows.map((r) => {
                    const open = expanded === r.id;
                    return (
                      <Fragment key={r.id}>
                        <TableRow className="border-rule-2">
                          <TableCell className="px-3 py-[7px]">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-expanded={open}
                              aria-label={open ? t("collapse") : t("expand")}
                              onClick={() => setExpanded(open ? null : r.id)}
                            >
                              {open ? (
                                <ChevronDown className="size-4" aria-hidden="true" />
                              ) : (
                                <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
                              )}
                            </Button>
                          </TableCell>

                          <TableCell className="px-3 py-[7px] whitespace-nowrap">
                            <Num.Date
                              value={r.createdAt}
                              locale={locale}
                              options={{ hour: "2-digit", minute: "2-digit" }}
                              className="text-[11px] text-ink-2"
                            />
                          </TableCell>

                          <TableCell className="px-3 py-[7px]">
                            <span className="text-[13px] font-medium text-ink">
                              {r.actorName ?? (r.actorId ? null : t("system"))}
                              {!r.actorName && r.actorId ? <Num.Code>{r.actorId.slice(0, 8)}</Num.Code> : null}
                            </span>
                            {r.actorRole ? (
                              <StatusBadge tone="neutral" className="ms-1.5">
                                {tRole(asKey(r.actorRole))}
                              </StatusBadge>
                            ) : null}
                            {r.onBehalfOf ? (
                              <span className="block text-[11px] text-ink-3">
                                {t("onBehalfOf")} {r.onBehalfOfName ?? <Num.Code>{r.onBehalfOf.slice(0, 8)}</Num.Code>}
                              </span>
                            ) : null}
                          </TableCell>

                          <TableCell className="px-3 py-[7px]">
                            <Num.Code className="text-[11px] text-ink">{r.action}</Num.Code>
                          </TableCell>

                          <TableCell className="px-3 py-[7px]">
                            <span className="text-[13px] text-ink-2">{r.targetType ?? "—"}</span>
                            {r.targetId ? (
                              <Num.Code className="block text-[11px]">{r.targetId}</Num.Code>
                            ) : null}
                          </TableCell>
                        </TableRow>

                        {open ? (
                          <TableRow className="border-rule-2">
                            <TableCell colSpan={5} className="bg-field px-3 py-3">
                              <div className="grid gap-3 md:grid-cols-2">
                                <StateBlock label={t("before")} value={r.beforeState} empty={t("noState")} locale={locale} />
                                <StateBlock label={t("after")} value={r.afterState} empty={t("noState")} locale={locale} />
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      }
    />
  );
}

function StateBlock({
  label,
  value,
  empty,
  locale,
}: {
  label: string;
  value: unknown;
  empty: string;
  locale: Locale;
}) {
  return (
    <div className="rounded-lg border border-rule bg-sheet p-2">
      <Eyebrow locale={locale} className="mb-1">
        {label}
      </Eyebrow>
      {value == null ? (
        <p className="text-[11px] text-ink-3">{empty}</p>
      ) : (
        <pre className="num overflow-x-auto text-[11px] whitespace-pre-wrap text-ink-2" dir="ltr">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function AuditLogScreen() {
  const t = useTranslations("auditLog");
  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader title={t("title")} description={t("subtitle")} rule />

      <p className="flex gap-2 rounded-lg border border-rule bg-field p-3 text-[13px] text-ink-2">
        <Lock className="mt-px size-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-semibold text-ink">{t("appendOnlyTitle")}</span> — {t("appendOnlyBody")}
        </span>
      </p>

      <AuditLogTable />
    </div>
  );
}
