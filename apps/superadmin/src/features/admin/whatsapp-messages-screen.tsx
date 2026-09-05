"use client";

import { useState } from "react";
import { useOne } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { MessageSquare } from "lucide-react";

import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { Num } from "@repo/ui/components/num";
import { StatusBadge, statusTone } from "@repo/ui/components/status-badge";
import type { Locale } from "@repo/ui/lib/format";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";

import type { ColumnDef } from "@/components/kit/data-table";
import { ListFilter, ListSearch, ListShell } from "@/components/kit/list-shell";
import { useListScreen } from "@/lib/api/use-list-screen";

type MessageRow = {
  id: string;
  recipientPhone: string;
  template: string;
  locale: string;
  status: "queued" | "sent" | "failed";
  provider: "mock" | "cloud_api";
  providerMessageId: string | null;
  createdAt: string;
};

const STATUSES = ["sent", "failed", "queued"] as const;

export function WhatsAppMessagesScreen() {
  const t = useTranslations();
  const queryStrings = useQueryStrings();
  const locale = useLocale() as Locale;
  const [detail, setDetail] = useState<MessageRow | null>(null);

  const list = useListScreen<MessageRow>({ resource: "admin/whatsapp-messages" });

  // params (the child's name and student code) and the provider payload belong to
  // the one row an operator opens, so they are fetched then — not shipped with every
  // row in the list.
  const { query: detailQuery, result: detailResult } = useOne({
    resource: "admin/whatsapp-messages",
    id: detail?.id ?? "",
    queryOptions: { enabled: !!detail },
  });
  const full = detailResult?.data as
    | { params: string[] | null; providerResponse: unknown; error: string | null }
    | undefined;

  const columns: ColumnDef<MessageRow, unknown>[] = [
    {
      id: "recipient",
      header: t("whatsapp.colRecipient"),
      cell: ({ row }) => (
        <span className="font-mono" dir="ltr">
          {row.original.recipientPhone}
        </span>
      ),
    },
    {
      id: "template",
      header: t("whatsapp.colTemplate"),
      cell: ({ row }) => row.original.template,
    },
    {
      id: "status",
      header: t("whatsapp.colStatus"),
      cell: ({ row }) => (
        <StatusBadge tone={statusTone(row.original.status)}>{row.original.status}</StatusBadge>
      ),
    },
    {
      id: "provider",
      header: t("whatsapp.colProvider"),
      cell: ({ row }) => row.original.provider,
    },
    {
      id: "at",
      header: t("whatsapp.colAt"),
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
      title={t("whatsapp.title")}
      description={t("whatsapp.description")}
      columns={columns}
      onRowClick={(row) => setDetail(row)}
      rowLabel={(row) => row.recipientPhone ?? row.id}
      toolbar={
        <>
          <ListSearch
            list={list}
            placeholder={t("whatsapp.searchPlaceholder")}
            clearLabel={t("whatsapp.clearSearch")}
          />
          <ListFilter
            list={list}
            name="status"
            anyLabel={t("whatsapp.any")}
            options={STATUSES}
            render={(s) => s}
          />
        </>
      }
      emptyIcon={MessageSquare}
      emptyTitle={t("whatsapp.empty")}
    >
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.template}</DialogTitle>
          </DialogHeader>
          {detail && detailQuery.isError ? (
            <LoadError
              message={queryStrings.loadFailed}
              onRetry={() => detailQuery.refetch()}
              retryLabel={queryStrings.retry}
            />
          ) : detail ? (
            <div className="space-y-3 text-sm">
              <div dir="ltr" className="font-mono">
                {detail.recipientPhone}
              </div>
              <div>
                <span className="font-medium">{t("whatsapp.detailParams")}: </span>
                <pre className="mt-1 overflow-x-auto rounded bg-field p-2 text-xs" dir="ltr">
                  {full ? JSON.stringify(full.params, null, 2) : "…"}
                </pre>
              </div>
              {full?.error ? <p className="text-red">{full.error}</p> : null}
              <div>
                <span className="font-medium">{t("whatsapp.detailResponse")}: </span>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-field p-2 text-xs" dir="ltr">
                  {full ? JSON.stringify(full.providerResponse, null, 2) : "…"}
                </pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </ListShell>
  );
}
