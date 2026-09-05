"use client";

import { useState } from "react";
import { useOne } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { CreditCard } from "lucide-react";

import { Eyebrow } from "@repo/ui/components/eyebrow";
import { IdentityCell, initialsOf } from "@repo/ui/components/identity-cell";
import { Num } from "@repo/ui/components/num";
import { StatusBadge, statusTone } from "@repo/ui/components/status-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import type { Locale } from "@repo/ui/lib/format";

import type { ColumnDef } from "@/components/kit/data-table";
import { ListFilter, ListSearch, ListShell } from "@/components/kit/list-shell";
import { PageSpinner } from "@/components/kit/spinner";
import { useListScreen } from "@/lib/api/use-list-screen";
import { useParamSeed } from "@/lib/api/use-param-seed";
import { asKey } from "@/lib/i18n/keys";

type IntentRow = {
  id: string;
  studentName: string | null;
  studentEmail: string | null;
  payerName: string | null;
  payerEmail: string | null;
  purpose: string | null;
  courseTitle: string | null;
  centerName: string | null;
  amount: number;
  currency: string;
  method: string;
  gateway: string;
  status: string;
  gatewayOrderId: string | null;
  gatewayRef: string | null;
  failureReason: string | null;
  createdAt: string;
  paidAt: string | null;
};

export function PaymentIntentsScreen({ apiBase }: { apiBase: "admin" | "finance" }) {
  const t = useTranslations();
  const queryStrings = useQueryStrings();
  const locale = useLocale() as Locale;
  const [detailId, setDetailId] = useState<string | null>(null);

  const resource = `${apiBase}/payment-intents`;
  const list = useListScreen<IntentRow>({ resource });
  useParamSeed("q", list.setQ);

  const { query: detailQuery, result: detail } = useOne({
    resource,
    id: detailId ?? "",
    queryOptions: { enabled: !!detailId },
  });
  const d = ((detail as any)?.data ?? detail) as any;

  const columns: ColumnDef<IntentRow, unknown>[] = [
    {
      id: "student",
      header: t("paymentIntents.student"),
      cell: ({ row }) => (
        <IdentityCell
          initials={initialsOf(row.original.studentName ?? row.original.payerName ?? "—")}
          name={row.original.studentName ?? row.original.payerName ?? "—"}
          meta={
            row.original.studentEmail ? (
              <Num.Code>{row.original.studentEmail}</Num.Code>
            ) : row.original.payerEmail ? (
              <Num.Code>{row.original.payerEmail}</Num.Code>
            ) : undefined
          }
        />
      ),
    },
    {
      id: "course",
      header: t("paymentIntents.course"),
      cell: ({ row }) =>
        row.original.courseTitle ??
        (row.original.purpose && row.original.purpose !== "subscription"
          ? t(asKey(`paymentIntents.purpose_${row.original.purpose}`))
          : "—"),
    },
    {
      id: "center",
      header: t("paymentIntents.center"),
      cell: ({ row }) => row.original.centerName ?? "—",
    },
    {
      id: "amount",
      header: t("paymentIntents.amount"),
      cell: ({ row }) => (
        <Num.Money
          piasters={row.original.amount}
          locale={locale}
          tone={row.original.status === "paid" ? "net" : "muted"}
          sign={false}
        />
      ),
    },
    {
      id: "method",
      header: t("paymentIntents.method"),
      cell: ({ row }) => t(asKey(`methods.${row.original.method}`)),
    },
    {
      id: "gateway",
      header: t("paymentIntents.gateway"),
      cell: ({ row }) => t(asKey(`gateways.${row.original.gateway}`)),
    },
    {
      id: "status",
      header: t("paymentIntents.status"),
      cell: ({ row }) => (
        <StatusBadge
          tone={statusTone(row.original.status)}
          reason={row.original.status === "failed" ? row.original.failureReason : undefined}
        >
          {t(asKey(`status.${row.original.status}`))}
        </StatusBadge>
      ),
    },
    {
      id: "created",
      header: t("paymentIntents.created"),
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
      title={t("paymentIntents.title")}
      description={t("paymentIntents.subtitle")}
      columns={columns}
      onRowClick={(row) => setDetailId(row.id)}
      rowLabel={(row) => row.studentName ?? row.payerName ?? row.id}
      toolbar={
        <>
          <ListSearch
            list={list}
            placeholder={t("paymentIntents.searchPlaceholder")}
            clearLabel={t("paymentIntents.clearSearch")}
          />
          <ListFilter
            list={list}
            name="status"
            anyLabel={t("paymentIntents.anyStatus")}
            options={["pending", "paid", "failed", "expired"]}
            render={(o) => t(asKey(`status.${o}`))}
          />
          <ListFilter
            list={list}
            name="gateway"
            anyLabel={t("paymentIntents.anyGateway")}
            options={["mock", "paymob"]}
            render={(o) => t(asKey(`gateways.${o}`))}
          />
          <ListFilter
            list={list}
            name="method"
            anyLabel={t("paymentIntents.anyMethod")}
            options={["card", "wallet"]}
            render={(o) => t(asKey(`methods.${o}`))}
          />
        </>
      }
      loadingLabel={t("paymentIntents.loading")}
      emptyIcon={CreditCard}
      emptyTitle={t("paymentIntents.notFound")}
      emptyDescription={t("paymentIntents.emptyBody")}
      errorTitle={t("paymentIntents.loadError")}
      errorDescription={t("paymentIntents.loadErrorBody")}
      deniedTitle={t("paymentIntents.deniedTitle")}
      deniedDescription={t("paymentIntents.deniedBody")}
    >
      <Dialog open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("paymentIntents.intentDetail")}</DialogTitle>
          </DialogHeader>
          {d ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              <Row label={t("paymentIntents.intentId")}>
                <Num.Code>{d.id}</Num.Code>
              </Row>
              <Row label={t("paymentIntents.student")}>
                {d.student?.name}{" "}
                {d.student?.email ? <Num.Code>{d.student.email}</Num.Code> : null}
              </Row>
              <Row label={t("paymentIntents.course")}>{d.course?.title ?? "—"}</Row>
              <Row label={t("paymentIntents.center")}>{d.center?.name ?? "—"}</Row>
              <Row label={t("paymentIntents.amount")}>
                <Num.Money piasters={d.amount} locale={locale} tone="net" sign={false} />
              </Row>
              <Row label={t("paymentIntents.methodGateway")}>
                {t(asKey(`methods.${d.method}`))} / {t(asKey(`gateways.${d.gateway}`))}
              </Row>
              <Row label={t("paymentIntents.status")}>
                <StatusBadge
                  tone={statusTone(d.status)}
                  reason={d.failureReason ?? undefined}
                >
                  {t(asKey(`status.${d.status}`))}
                </StatusBadge>
              </Row>
              <Row label={t("paymentIntents.gatewayOrderRef")}>
                <Num.Code>
                  {d.gatewayOrderId ?? "—"} / {d.gatewayRef ?? "—"}
                </Num.Code>
              </Row>
              <Row label={t("paymentIntents.receipt")}>
                {d.payment?.receiptNumber ? <Num.Code>{d.payment.receiptNumber}</Num.Code> : "—"}
              </Row>
              <Row label={t("paymentIntents.ledgerTxn")}>
                {d.transaction?.refNumber ? <Num.Code>{d.transaction.refNumber}</Num.Code> : "—"}
              </Row>
              <Row label={t("paymentIntents.createdPaid")}>
                <Num.Date value={d.createdAt} locale={locale} />
                {d.paidAt ? (
                  <>
                    <span aria-hidden="true" className="mx-1 text-ink-3">
                      →
                    </span>
                    <Num.Date value={d.paidAt} locale={locale} />
                  </>
                ) : null}
              </Row>
            </dl>
          ) : detailQuery.isError ? (
            <LoadError
              message={queryStrings.loadFailed}
              onRetry={() => detailQuery.refetch()}
              retryLabel={queryStrings.retry}
            />
          ) : (
            <PageSpinner label={t("common.loading")} />
          )}
          {d?.webhookPayload ? (
            <div className="mt-3">
              <Eyebrow locale={locale} className="mb-1">
                {t("paymentIntents.rawWebhook")}
              </Eyebrow>
              <pre className="num max-h-56 overflow-auto rounded-lg bg-field p-3 text-[11px]" dir="ltr">
                {JSON.stringify(d.webhookPayload, null, 2)}
              </pre>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </ListShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-ink-2">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}
