"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Download, FileText, Mail } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Num } from "@repo/ui/components/num";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { StatusBadge, statusTone } from "@repo/ui/components/status-badge";
import type { Locale } from "@repo/ui/lib/format";

import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { useCustom } from "@refinedev/core";
import { type ColumnDef } from "@/components/kit/data-table";
import { ListShell } from "@/components/kit/list-shell";
import { useCustomListScreen } from "@/lib/api/use-list-screen";
import { TableSkeleton } from "@/components/ui/skeletons";
import { useAction } from "@/lib/api/use-action";
import { asKey } from "@/lib/i18n/keys";

type Invoice = {
  id: string;
  number: string | null;
  type: string;
  status: string | null;
  total: number;
  issuedToId: string | null;
  centerId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
};

export function InvoicesScreen() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState<Invoice | null>(null);

  const list = useCustomListScreen<Invoice>({
    url: "finance/invoices",
    select: (d) => {
      const p = (d ?? {}) as { data?: Invoice[]; total?: number };
      return { rows: p.data ?? [], total: p.total ?? 0 };
    },
  });

  const { run, busyKey } = useAction();

  const sendEmail = async (invoice: Invoice) => {
    const res = await run({
      url: `finance/invoices/${invoice.id}/send-email`,
      values: {},
      key: invoice.id,
      successMsg: t("invoices.emailSent"),
    });
    if (!res.ok) throw res.error;
  };

  const columns: ColumnDef<Invoice, unknown>[] = [
    {
      id: "number",
      header: t("invoices.colNumber"),
      cell: ({ row }) => (
        <Num.Code>{row.original.number ?? row.original.id.slice(0, 8)}</Num.Code>
      ),
    },
    {
      id: "type",
      header: t("invoices.colType"),
      cell: ({ row }) => t(asKey(`invoices.type_${row.original.type}`)),
    },
    {
      id: "total",
      header: t("invoices.colTotal"),
      cell: ({ row }) => <Num.Money piasters={row.original.total} locale={locale} />,
    },
    {
      id: "status",
      header: t("invoices.colStatus"),
      cell: ({ row }) =>
        row.original.status ? (
          <StatusBadge tone={statusTone(row.original.status)}>
            {t(asKey(`status.${row.original.status}`))}
          </StatusBadge>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      id: "when",
      header: t("invoices.colWhen"),
      cell: ({ row }) => (
        <Num.Date value={row.original.createdAt} locale={locale} className="text-[11px] text-ink-3" />
      ),
    },
    {
      id: "actions",
      header: t("common.colActions"),
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {/* A plain link, not a scripted download: the PDF route answers with
              the file and the browser's own cookie carries the session. */}
          <Button variant="ghost" size="icon" className="size-7" asChild>
            <a
              href={`/api/v1/finance/invoices/${row.original.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Download className="size-3.5" />
              <span className="sr-only">{t("invoices.downloadPdf")}</span>
            </a>
          </Button>
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={busyKey === row.original.id}
              >
                <Mail className="size-3.5" />
                <span className="sr-only">{t("invoices.sendEmail")}</span>
              </Button>
            }
            title={t("invoices.sendEmailTitle")}
            description={t("invoices.sendEmailBody")}
            confirmText={t("invoices.sendEmail")}
            onConfirm={() => sendEmail(row.original)}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <ListShell
        list={list}
        title={t("invoices.title")}
        description={t("invoices.description")}
        columns={columns}
        onRowClick={(r) => setOpen(r)}
        rowLabel={(r) => r.number ?? r.id}
        emptyIcon={FileText}
        emptyTitle={t("invoices.empty")}
        emptyDescription={t("invoices.emptyBody")}
      />

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{open?.number ?? t("invoices.detailTitle")}</DialogTitle>
          </DialogHeader>
          {open ? <InvoiceDetail id={open.id} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function InvoiceDetail({ id }: { id: string }) {
  const locale = useLocale() as Locale;
  const queryStrings = useQueryStrings();
  const req = useCustom<Record<string, unknown>>({
    url: `finance/invoices/${id}`,
    method: "get",
  });
  const data = req.result?.data as Record<string, unknown> | undefined;

  if (req.query.isLoading) return <TableSkeleton rows={4} />;
  if (req.query.isError || !data) {
    return <p className="text-[13px] text-red">{queryStrings.loadFailed}</p>;
  }

  return (
    <dl className="grid gap-1.5 rounded-[10px] border border-rule bg-field p-4 text-[13px]">
      {Object.entries(data).map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0 text-ink-2">{k}</dt>
          <dd className="min-w-0 truncate text-end text-ink" dir="ltr">
            {k === "total" || k === "subtotal" || k === "tax" ? (
              <Num.Money piasters={Number(v ?? 0)} locale={locale} />
            ) : v === null || v === undefined ? (
              "—"
            ) : typeof v === "object" ? (
              JSON.stringify(v)
            ) : (
              String(v)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
