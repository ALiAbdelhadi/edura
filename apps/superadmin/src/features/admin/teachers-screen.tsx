"use client";

/* المدرّسون / Teachers — a record screen with one in-place control.
   ══════════════════════════════════════════════════════════════════════════════

   The attendance-mode select is a genuine setting, not a money write: it is a global
   per-teacher preference that can be changed again at any time, so it saves on ONE
   interaction (D-022). It stays in the row rather than moving to a panel because it is
   the only action here and it is reversible — the "no per-row buttons" rule (D-038)
   exists to stop DESTRUCTIVE twins competing in a decision queue, which this is not.

   A teacher with no profile row gets a plain statement, NOT a disabled select: the
   capability does not exist for that record, and a greyed control would teach that it
   does and is being withheld (D-027). */

import { useState } from "react";
import { useCustomMutation, useList } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { RefreshCcw, TriangleAlert, UserRound } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { IdentityCell, initialsOf } from "@repo/ui/components/identity-cell";
import { Num } from "@repo/ui/components/num";
import { SearchInput } from "@repo/ui/components/search-input";
import { StatusBadge, type StatusTone } from "@repo/ui/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { toast } from "@repo/ui/components/sonner";
import type { Locale } from "@repo/ui/lib/format";

import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner } from "@/components/kit/spinner";
import { asKey } from "@/lib/i18n/keys";

type TeacherRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  attendanceMode: "counter_only" | "counter_and_door" | null;
};

const ANY = "__any__";
const MODES = ["counter_only", "counter_and_door"] as const;

const TONE: Record<string, StatusTone> = {
  active: "paid",
  pending: "pending",
  suspended: "rejected",
};

export function TeachersScreen() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const { mutateAsync: patch } = useCustomMutation();

  const { query, result } = useList({
    resource: "admin/teachers",
    filters: [
      ...(q ? [{ field: "q", operator: "eq" as const, value: q }] : []),
      ...(status ? [{ field: "status", operator: "eq" as const, value: status }] : []),
      ...(mode ? [{ field: "mode", operator: "eq" as const, value: mode }] : []),
    ],
    pagination: { currentPage: page, pageSize: 20 },
  });

  const rows = (result?.data ?? []) as TeacherRow[];
  const total = (result?.total ?? 0) as number;
  const pageCount = Math.max(1, Math.ceil(total / 20));

  const setTeacherMode = async (row: TeacherRow, next: string) => {
    if (next === row.attendanceMode) return;
    try {
      await patch({
        url: `admin/teachers/${row.id}/attendance-mode`,
        method: "patch",
        values: { mode: next },
      });
      toast.success(t("teachers.modeSaved"));
      void query.refetch();
    } catch {
      toast.error(t("teachers.modeFailed"));
    }
  };

  const select = (
    anyLabel: string,
    value: string | null,
    set: (v: string | null) => void,
    options: readonly string[],
    render: (o: string) => string,
  ) => (
    <select
      value={value ?? ANY}
      aria-label={anyLabel}
      onChange={(e) => {
        set(e.target.value === ANY ? null : e.target.value);
        setPage(1);
      }}
      className="focus-ledger h-8 rounded-lg border border-rule bg-field px-2 text-[13px] text-ink-2"
    >
      <option value={ANY}>{anyLabel}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {render(o)}
        </option>
      ))}
    </select>
  );

  const COLS = ["colName", "colContact", "colStatus", "colMode", "colJoined"] as const;

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader title={t("teachers.title")} description={t("teachers.description")} rule />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rule bg-sheet px-4 py-3 shadow-[var(--lift)]">
        <SearchInput
          className="min-w-64 flex-1"
          placeholder={t("teachers.searchPlaceholder")}
          value={q}
          onValueChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          onClear={() => setQ("")}
          clearLabel={t("teachers.clearSearch")}
        />
        {select(t("teachers.anyStatus"), status, setStatus, ["active", "pending", "suspended"], (s) =>
          t(asKey(`status.${s}`)),
        )}
        {select(t("teachers.anyMode"), mode, setMode, MODES, (m) => t(asKey(`teachers.mode_${m}`)))}
      </div>

      {query.isLoading ? (
        <PageSpinner label={t("common.loading")} />
      ) : query.isError ? (
        (() => {
          const denied = (query.error as { statusCode?: number } | null)?.statusCode === 403;
          return (
            <EmptyState
              tone={denied ? "denied" : "error"}
              icon={TriangleAlert}
              title={t(denied ? "teachers.deniedTitle" : "teachers.loadError")}
              description={t(denied ? "teachers.deniedBody" : "teachers.loadErrorBody")}
              action={
                denied ? undefined : (
                  <Button variant="outline" onClick={() => query.refetch()}>
                    <RefreshCcw className="size-4" aria-hidden="true" />
                    {t("teachers.retry")}
                  </Button>
                )
              }
            />
          );
        })()
      ) : rows.length === 0 ? (
        <EmptyState
          tone="empty"
          icon={UserRound}
          title={t("teachers.empty")}
          description={t("teachers.emptyBody")}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-rule bg-sheet shadow-[var(--lift)]">
          <Table>
            <TableHeader>
              <TableRow className="border-rule bg-field hover:bg-field">
                {COLS.map((c) => (
                  <TableHead key={c} className="h-[34px] px-3">
                    <Eyebrow locale={locale} marker={false}>
                      {t(asKey(`teachers.${c}`))}
                    </Eyebrow>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="border-rule-2">
                  <TableCell className="px-3 py-[7px]">
                    <IdentityCell initials={initialsOf(r.name ?? "—")} name={r.name ?? "—"} />
                  </TableCell>
                  <TableCell className="px-3 py-[7px]">
                    {r.email ? <Num.Code className="block">{r.email}</Num.Code> : <span className="text-[13px]">—</span>}
                    {r.phone ? <Num.Code className="block">{r.phone}</Num.Code> : null}
                  </TableCell>
                  <TableCell className="px-3 py-[7px]">
                    <StatusBadge tone={TONE[r.status] ?? "neutral"}>
                      {t(asKey(`status.${r.status}`))}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="px-3 py-[7px]">
                    {r.attendanceMode === null ? (
                      // Absence, not a disabled control (D-027).
                      <span className="text-[11px] text-ink-3">{t("teachers.noProfile")}</span>
                    ) : (
                      <select
                        value={r.attendanceMode}
                        aria-label={t("teachers.modeAria")}
                        onChange={(e) => void setTeacherMode(r, e.target.value)}
                        className="focus-ledger h-8 rounded-lg border border-rule bg-field px-2 text-[13px] text-ink"
                      >
                        {MODES.map((m) => (
                          <option key={m} value={m}>
                            {t(asKey(`teachers.mode_${m}`))}
                          </option>
                        ))}
                      </select>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-[7px]">
                    <Num.Date value={r.createdAt} locale={locale} className="text-[11px] text-ink-3" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-field px-[18px] py-3">
            <Num className="text-[11px] text-ink-3">
              {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} / {total}
            </Num>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                {t("teachers.prev")}
              </Button>
              <Num className="text-[11px] text-ink-3">
                {page} / {pageCount}
              </Num>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("teachers.next")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
