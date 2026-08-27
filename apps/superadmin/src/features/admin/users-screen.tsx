"use client";

import { useEffect, useState } from "react";
import { useCustom } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { RefreshCcw, ShieldCheck, ShieldOff, TriangleAlert, UsersRound } from "lucide-react";

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
import type { Locale } from "@repo/ui/lib/format";

import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner } from "@/components/kit/spinner";
import { useRouter } from "@/i18n/navigation";
import { asKey } from "@/lib/i18n/keys";

export type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  locale: string | null;
  twoFactorEnabled: boolean | null;
  isDemo: boolean;
  createdAt: string;
};

const ANY = "__any__";
const PAGE = 25;

export const USER_ROLES = [
  "student",
  "parent",
  "teacher",
  "assistant",
  "center_admin",
  "center_staff",
  "accountant",
  "super_admin",
] as const;

export const USER_STATUSES = ["active", "pending", "suspended", "blacklisted", "shell"] as const;

export const STATUS_TONE: Record<string, StatusTone> = {
  active: "paid",
  pending: "pending",
  suspended: "rejected",
  blacklisted: "rejected",
  shell: "neutral",
};

export function UsersScreen() {
  const t = useTranslations("adminUsers");
  const tg = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const filterKey = `${debouncedQ}|${role ?? ""}|${status ?? ""}`;
  useEffect(() => {
    setCursor(null);
    setRows([]);
    setNextCursor(null);
  }, [filterKey]);

  const query: Record<string, string> = { take: String(PAGE) };
  if (debouncedQ) query.q = debouncedQ;
  if (role) query.role = role;
  if (status) query.status = status;
  if (cursor) query.cursor = cursor;

  const req = useCustom({ url: "admin/users", method: "get", config: { query } });
  const data = req.result?.data as { users: UserRow[]; nextCursor: string | null } | undefined;

  useEffect(() => {
    const page = data?.users;
    if (!page) return;
    setNextCursor(data?.nextCursor ?? null);
    setRows((prev) => {
      if (!cursor) return page;
      const seen = new Set(prev.map((u) => u.id));
      return [...prev, ...page.filter((u) => !seen.has(u.id))];
    });
  }, [data, cursor]);

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
      onChange={(e) => set(e.target.value === ANY ? null : e.target.value)}
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

  const COLS = ["colUser", "colRole", "colStatus", "colSecurity", "colJoined"] as const;
  const firstLoad = req.query.isLoading && rows.length === 0;

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader title={t("title")} description={t("subtitle")} rule />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rule bg-sheet px-4 py-3 shadow-[var(--lift)]">
        <SearchInput
          className="min-w-64 flex-1"
          placeholder={t("searchPlaceholder")}
          value={q}
          onValueChange={setQ}
          onClear={() => setQ("")}
          clearLabel={t("clearSearch")}
        />
        {select(t("anyRole"), role, setRole, USER_ROLES, (r) => tg(asKey(`roles.${r}`)))}
        {select(t("anyStatus"), status, setStatus, USER_STATUSES, (s) =>
          tg(asKey(`status.${s}`)),
        )}
      </div>

      {firstLoad ? (
        <PageSpinner label={tg("common.loading")} />
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
        <EmptyState
          tone="empty"
          icon={UsersRound}
          title={t("empty")}
          description={t("emptyBody")}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-rule bg-sheet shadow-[var(--lift)]">
          <Table>
            <TableHeader>
              <TableRow className="border-rule bg-field hover:bg-field">
                {COLS.map((c) => (
                  <TableHead key={c} className="h-[34px] px-3">
                    <Eyebrow locale={locale} marker={false}>
                      {t(c)}
                    </Eyebrow>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  tabIndex={0}
                  role="link"
                  aria-label={r.name ?? r.email ?? r.id}
                  className="focus-ledger cursor-pointer border-rule-2"
                  onClick={() => router.push(`/dashboard/superadmin/users/${r.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/dashboard/superadmin/users/${r.id}`);
                    }
                  }}
                >
                  <TableCell className="px-3 py-[7px]">
                    <IdentityCell
                      initials={initialsOf(r.name ?? r.email ?? "—")}
                      name={r.name ?? "—"}
                    />
                    {r.email ? (
                      <Num.Code className="block text-[11px]">{r.email}</Num.Code>
                    ) : r.phone ? (
                      <Num.Code className="block text-[11px]">{r.phone}</Num.Code>
                    ) : null}
                  </TableCell>

                  <TableCell className="px-3 py-[7px]">
                    <StatusBadge tone="neutral">{tg(asKey(`roles.${r.role}`))}</StatusBadge>
                  </TableCell>

                  <TableCell className="px-3 py-[7px]">
                    <StatusBadge tone={STATUS_TONE[r.status] ?? "neutral"}>
                      {tg(asKey(`status.${r.status}`))}
                    </StatusBadge>
                    {r.isDemo ? (
                      <StatusBadge tone="active" className="ms-1.5">
                        {t("demo")}
                      </StatusBadge>
                    ) : null}
                  </TableCell>

                  <TableCell className="px-3 py-[7px]">
                    {r.twoFactorEnabled ? (
                      <span className="flex items-center gap-1.5 text-[11px] text-teal">
                        <ShieldCheck className="size-4" aria-hidden="true" />
                        {t("twoFactorOn")}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
                        <ShieldOff className="size-4" aria-hidden="true" />
                        {t("twoFactorOff")}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="px-3 py-[7px]">
                    <Num.Date
                      value={r.createdAt}
                      locale={locale}
                      className="text-[11px] text-ink-3"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-field px-[18px] py-3">
            <span className="flex items-baseline gap-1.5 text-[11px] text-ink-3">
              <Num.Figure value={rows.length} locale={locale} />
              {t("shown")}
            </span>
            {nextCursor ? (
              <Button
                variant="outline"
                size="sm"
                disabled={req.query.isFetching}
                onClick={() => setCursor(nextCursor)}
              >
                {t("loadMore")}
              </Button>
            ) : (
              <span className="text-[11px] text-ink-3">{t("endOfList")}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
