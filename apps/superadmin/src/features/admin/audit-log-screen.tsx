"use client";

/* سجل التدقيق / Audit log — the most literal ledger in the product.
   ══════════════════════════════════════════════════════════════════════════════

   `audit_logs` is REVOKEd UPDATE and DELETE for the application role, so this record
   cannot be edited or erased — not by a center admin, not by a super admin, not by
   this app. Everything about the screen's form follows from that one guarantee:

   - THE ACTOR IS NEVER BLANK. An unattributed action in an audited system is a gap
     the interface should not create, so an automated write reads «النظام» rather than
     an empty cell (constitution §1). It previously fell through to a raw actorId, or
     the untranslated literal "system".
   - STICKY DAY HEADERS. The log is read as a sequence of days, so the day a row
     belongs to must stay visible while scrolling through it.
   - EVERY REF IS MONO AND ISOLATED. Action names, target ids and timestamps are all
     Latin codes sitting beside Arabic prose — the single most common source of a bidi
     break in the product.
   - BEFORE AND AFTER, SIDE BY SIDE. What makes an oversight operation checkable is
     not that it was logged but that the change itself is legible. */

import { Fragment, useState } from "react";
import { todayKey } from "@repo/server-core/lib/date-key";
import { useCustom } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Lock, RefreshCcw, ScrollText, TriangleAlert } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { Input } from "@repo/ui/components/input";
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

import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner } from "@/components/kit/spinner";
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
  // Roles live in the shared top-level namespace, not under auditLog — reusing it
  // keeps one wording for a role across every screen.
  const tRole = useTranslations("roles");
  const locale = useLocale() as Locale;
  const [action, setAction] = useState("");
  const [targetId, setTargetId] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const query: Record<string, string> = { page: String(page), limit: "50" };
  if (fixedCenterId) query.centerId = fixedCenterId;
  if (action.trim()) query.action = action.trim();
  if (targetId.trim()) query.targetId = targetId.trim();

  const req = useCustom({ url: "admin/audit-logs", method: "get", config: { query } });
  const result = req.result?.data as { data: Row[]; total: number } | undefined;
  const rows = result?.data ?? [];
  const total = result?.total ?? 0;

  // Group into days so each day can carry a sticky header.
  const days: { day: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const k = dayKey(r.createdAt);
    const last = days[days.length - 1];
    if (last && last.day === k) last.rows.push(r);
    else days.push({ day: k, rows: [r] });
  }

  const dayLabel = (day: string) => {
    // Cairo wall-clock — see @repo/server-core/lib/date-key.
    const today = todayKey();
    const yesterday = todayKey(new Date(Date.now() - 86_400_000));
    if (day === today) return t("today");
    if (day === yesterday) return t("yesterday");
    return formatDate(day, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-rule bg-sheet px-4 py-3 shadow-[var(--lift)]">
        <label className="text-xs">
          <span className="mb-1 block text-ink-2">{t("filterAction")}</span>
          <Input
            value={action}
            placeholder={t("filterActionPlaceholder")}
            className="num w-64"
            dir="ltr"
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-ink-2">{t("filterTarget")}</span>
          <Input
            value={targetId}
            placeholder={t("filterTargetPlaceholder")}
            className="num w-72"
            dir="ltr"
            onChange={(e) => {
              setTargetId(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <span className="ms-auto flex items-baseline gap-1.5 text-[13px] text-ink-2">
          <Num.Figure value={total} locale={locale} />
          {t("entries")}
        </span>
      </div>

      {req.query.isLoading ? (
        <PageSpinner />
      ) : req.query.isError ? (
        (() => {
          const denied = (req.query.error as { statusCode?: number } | null)?.statusCode === 403;
          return (
            <EmptyState
              tone={denied ? "denied" : "error"}
              icon={TriangleAlert}
              title={t(denied ? "deniedTitle" : "loadError")}
              description={t(denied ? "deniedBody" : "loadErrorBody")}
              action={
                denied ? undefined : (
                  <Button variant="outline" onClick={() => req.query.refetch()}>
                    <RefreshCcw className="size-4" aria-hidden="true" />
                    {t("retry")}
                  </Button>
                )
              }
            />
          );
        })()
      ) : rows.length === 0 ? (
        <EmptyState tone="empty" icon={ScrollText} title={t("empty")} description={t("emptyBody")} />
      ) : (
        <>
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
                      <TableCell
                        colSpan={5}
                        className="sticky top-0 z-10 bg-field px-3 py-1.5"
                      >
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
                              {/* The actor is never absent. */}
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

          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {t("prev")}
            </Button>
            <span className="flex items-baseline gap-1 text-[11px] text-ink-3">
              {t("page")} <Num.Figure value={page} locale={locale} />
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page * 50 >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("next")}
            </Button>
          </div>
        </>
      )}
    </div>
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
