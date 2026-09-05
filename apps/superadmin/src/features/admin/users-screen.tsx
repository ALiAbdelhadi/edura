"use client";

import { useLocale, useTranslations } from "next-intl";
import { ShieldCheck, ShieldOff, UsersRound } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { IdentityCell, initialsOf } from "@repo/ui/components/identity-cell";
import { Num } from "@repo/ui/components/num";
import { StatusBadge, statusTone } from "@repo/ui/components/status-badge";
import type { Locale } from "@repo/ui/lib/format";

import type { ColumnDef } from "@/components/kit/data-table";
import { ListFilter, ListSearch, ListShell } from "@/components/kit/list-shell";
import { NewAccountantDialog } from "@/features/admin/new-accountant-dialog";
import { useRouter } from "@/i18n/navigation";
import { useCursorListScreen } from "@/lib/api/use-list-screen";
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

export function UsersScreen() {
  const t = useTranslations("adminUsers");
  const tg = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();

  const list = useCursorListScreen<UserRow>({
    url: "admin/users",
    take: PAGE,
    select: (data) => {
      const d = data as { users?: UserRow[]; nextCursor?: string | null } | undefined;
      return { rows: d?.users ?? [], nextCursor: d?.nextCursor ?? null };
    },
  });

  const openUser = (id: string) => router.push(`/dashboard/superadmin/users/${id}`);

  const columns: ColumnDef<UserRow, unknown>[] = [
    {
      id: "user",
      header: t("colUser"),
      cell: ({ row }) => (
        <>
          <IdentityCell
            initials={initialsOf(row.original.name ?? row.original.email ?? "—")}
            name={row.original.name ?? "—"}
          />
          {row.original.email ? (
            <Num.Code className="block text-[11px]">{row.original.email}</Num.Code>
          ) : row.original.phone ? (
            <Num.Code className="block text-[11px]">{row.original.phone}</Num.Code>
          ) : null}
        </>
      ),
    },
    {
      id: "role",
      header: t("colRole"),
      cell: ({ row }) => (
        <StatusBadge tone="neutral">{tg(asKey(`roles.${row.original.role}`))}</StatusBadge>
      ),
    },
    {
      id: "status",
      header: t("colStatus"),
      cell: ({ row }) => (
        <>
          <StatusBadge tone={statusTone(row.original.status)}>
            {tg(asKey(`status.${row.original.status}`))}
          </StatusBadge>
          {row.original.isDemo ? (
            <StatusBadge tone="active" className="ms-1.5">
              {t("demo")}
            </StatusBadge>
          ) : null}
        </>
      ),
    },
    {
      id: "security",
      header: t("colSecurity"),
      cell: ({ row }) =>
        row.original.twoFactorEnabled ? (
          <span className="flex items-center gap-1.5 text-[11px] text-teal">
            <ShieldCheck className="size-4" aria-hidden="true" />
            {t("twoFactorOn")}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <ShieldOff className="size-4" aria-hidden="true" />
            {t("twoFactorOff")}
          </span>
        ),
    },
    {
      id: "joined",
      header: t("colJoined"),
      cell: ({ row }) => (
        <Num.Date
          value={row.original.createdAt}
          locale={locale}
          className="text-[11px] text-ink-3"
        />
      ),
    },
  ];

  return (
    <ListShell
      list={list}
      title={t("title")}
      description={t("subtitle")}
      actions={<NewAccountantDialog onCreated={() => list.query.refetch()} />}
      columns={columns}
      onRowClick={(row) => openUser(row.id)}
      rowLabel={(row) => row.name ?? row.email ?? row.id}
      toolbar={
        <>
          <ListSearch
            list={list}
            placeholder={t("searchPlaceholder")}
            clearLabel={t("clearSearch")}
          />
          <ListFilter
            list={list}
            name="role"
            anyLabel={t("anyRole")}
            options={USER_ROLES}
            render={(r) => tg(asKey(`roles.${r}`))}
          />
          <ListFilter
            list={list}
            name="status"
            anyLabel={t("anyStatus")}
            options={USER_STATUSES}
            render={(s) => tg(asKey(`status.${s}`))}
          />
        </>
      }
      emptyIcon={UsersRound}
      emptyTitle={t("empty")}
      emptyDescription={t("emptyBody")}
      errorTitle={t("loadError")}
      errorDescription={t("loadErrorBody")}
      deniedTitle={t("deniedTitle")}
      deniedDescription={t("deniedBody")}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rule bg-field px-3 py-2">
          <span className="flex items-baseline gap-1.5 text-[11px] text-ink-3">
            <Num.Figure value={list.rows.length} locale={locale} />
            {t("shown")}
          </span>
          {list.hasMore ? (
            <Button
              variant="outline"
              size="sm"
              disabled={list.query.isFetching}
              onClick={list.loadMore}
            >
              {t("loadMore")}
            </Button>
          ) : (
            <span className="text-[11px] text-ink-3">{t("endOfList")}</span>
          )}
        </div>
      }
    />
  );
}
