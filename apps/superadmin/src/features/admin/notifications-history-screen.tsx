"use client";

import { useLocale, useTranslations } from "next-intl";
import { BellRing } from "lucide-react";

import { Num } from "@repo/ui/components/num";
import { StatusBadge } from "@repo/ui/components/status-badge";
import type { Locale } from "@repo/ui/lib/format";

import type { ColumnDef } from "@/components/kit/data-table";
import { ListShell, ListTextFilter } from "@/components/kit/list-shell";
import { useCursorListScreen } from "@/lib/api/use-list-screen";
import { asKey } from "@/lib/i18n/keys";

type Row = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
};

/**
 * Everything the platform has SENT, as opposed to the notifications screen,
 * which is what the signed-in operator received. Cursor-paged, because the
 * table only ever grows and a page number over it means nothing.
 */
export function NotificationsHistoryScreen() {
  const t = useTranslations();
  const locale = useLocale() as Locale;

  const list = useCursorListScreen<Row>({
    url: "admin/notifications/history",
    take: 50,
    textFilters: ["type"],
    select: (data) => {
      const d = data as { data?: Row[]; meta?: { nextCursor?: string | null } } | undefined;
      return { rows: d?.data ?? [], nextCursor: d?.meta?.nextCursor ?? null };
    },
  });

  const columns: ColumnDef<Row, unknown>[] = [
    {
      id: "title",
      header: t("notificationsHistory.colTitle"),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">{row.original.title}</p>
          {row.original.body ? (
            <p className="truncate text-[11px] text-ink-2">{row.original.body}</p>
          ) : null}
        </div>
      ),
    },
    {
      id: "type",
      header: t("notificationsHistory.colType"),
      cell: ({ row }) => (
        <span className="font-mono text-[11px]" dir="ltr">
          {row.original.type}
        </span>
      ),
    },
    {
      id: "read",
      header: t("notificationsHistory.colRead"),
      cell: ({ row }) => (
        <StatusBadge tone={row.original.read ? "success" : "neutral"}>
          {t(asKey(row.original.read ? "notificationsHistory.read" : "notificationsHistory.unread"))}
        </StatusBadge>
      ),
    },
    {
      id: "when",
      header: t("notificationsHistory.colWhen"),
      cell: ({ row }) => (
        <Num.Date value={row.original.createdAt} locale={locale} className="text-[11px] text-ink-3" />
      ),
    },
  ];

  return (
    <ListShell
      list={list}
      title={t("notificationsHistory.title")}
      description={t("notificationsHistory.description")}
      columns={columns}
      toolbar={
        <ListTextFilter
          list={list}
          name="type"
          label={t("notificationsHistory.filterType")}
          placeholder="payment_received"
          dir="ltr"
        />
      }
      loadingLabel={t("common.loading")}
      emptyIcon={BellRing}
      emptyTitle={t("notificationsHistory.empty")}
      emptyDescription={t("notificationsHistory.emptyBody")}
      errorTitle={t("notificationsHistory.loadError")}
      errorDescription={t("notificationsHistory.loadErrorBody")}
      deniedTitle={t("notificationsHistory.deniedTitle")}
      deniedDescription={t("notificationsHistory.deniedBody")}
    />
  );
}
