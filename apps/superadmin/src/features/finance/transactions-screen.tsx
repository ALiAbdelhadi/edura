"use client";

import { useState } from "react";
import { useOne } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { Receipt } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { LoadError } from "@repo/ui/components/ledger";
import { Num } from "@repo/ui/components/num";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { StatusBadge, statusTone } from "@repo/ui/components/status-badge";
import type { Locale } from "@repo/ui/lib/format";

import type { ColumnDef } from "@/components/kit/data-table";
import { ListFilter, ListShell } from "@/components/kit/list-shell";
import { Spinner } from "@/components/kit/spinner";
import { useListScreen } from "@/lib/api/use-list-screen";
import { asKey } from "@/lib/i18n/keys";

type TxRow = {
  id: string;
  type: string;
  status: string;
  amount: number;
  currency: string | null;
  centerId: string | null;
  createdAt: string;
};

const TYPES = ["payment", "commission", "payout", "refund", "adjustment"] as const;
const STATUSES = ["pending", "completed", "failed", "reversed"] as const;

export function TransactionsScreen() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const queryStrings = useQueryStrings();
  const [detailId, setDetailId] = useState<string | null>(null);

  const list = useListScreen<TxRow>({ resource: "finance/transactions", pageSize: 50 });

  const { query: detailQuery, result: detail } = useOne({
    resource: "finance/transactions",
    id: detailId ?? "",
    queryOptions: { enabled: !!detailId },
  });
  const row = detail?.data as Record<string, unknown> | undefined;

  const columns: ColumnDef<TxRow, unknown>[] = [
    {
      id: "type",
      header: t("transactions.colType"),
      cell: ({ row }) => t(asKey(`transactions.type_${row.original.type}`)),
    },
    {
      id: "amount",
      header: t("transactions.colAmount"),
      cell: ({ row }) => <Num.Money piasters={row.original.amount} locale={locale} />,
    },
    {
      id: "status",
      header: t("transactions.colStatus"),
      cell: ({ row }) => (
        <StatusBadge tone={statusTone(row.original.status)}>
          {t(asKey(`status.${row.original.status}`))}
        </StatusBadge>
      ),
    },
    {
      id: "when",
      header: t("transactions.colWhen"),
      cell: ({ row }) => (
        <Num.Date value={row.original.createdAt} locale={locale} className="text-[11px] text-ink-3" />
      ),
    },
  ];

  return (
    <>
      <ListShell
        list={list}
        title={t("transactions.title")}
        description={t("transactions.description")}
        columns={columns}
        onRowClick={(r) => setDetailId(r.id)}
        rowLabel={(r) => r.id}
        toolbar={
          <>
            <ListFilter
              list={list}
              name="type"
              anyLabel={t("transactions.anyType")}
              options={TYPES}
              render={(x) => t(asKey(`transactions.type_${x}`))}
            />
            <ListFilter
              list={list}
              name="status"
              anyLabel={t("transactions.anyStatus")}
              options={STATUSES}
              render={(x) => t(asKey(`status.${x}`))}
            />
          </>
        }
        loadingLabel={t("common.loading")}
        emptyIcon={Receipt}
        emptyTitle={t("transactions.empty")}
        emptyDescription={t("transactions.emptyBody")}
        errorTitle={t("transactions.loadError")}
        errorDescription={t("transactions.loadErrorBody")}
        deniedTitle={t("transactions.deniedTitle")}
        deniedDescription={t("transactions.deniedBody")}
      />

      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("transactions.detailTitle")}</DialogTitle>
          </DialogHeader>
          {detailQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : detailQuery.isError || !row ? (
            <LoadError
              message={queryStrings.loadFailed}
              onRetry={() => void detailQuery.refetch()}
              retryLabel={queryStrings.retry}
            />
          ) : (
            // The ledger row is append-only and this is a read: every field it
            // carries is shown, rather than a hand-picked subset that quietly
            // drops the one an accountant came looking for.
            <dl className="grid gap-1.5 rounded-[10px] border border-rule bg-field p-4 text-[13px]">
              {Object.entries(row).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-ink-2">{k}</dt>
                  <dd className="min-w-0 truncate text-end text-ink" dir="ltr">
                    {v === null || v === undefined ? "—" : String(v)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
