"use client";

import { useState } from "react";
import { useList, useOne } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { CreditCard, RefreshCcw, TriangleAlert } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { IdentityCell, initialsOf } from "@repo/ui/components/identity-cell";
import { Num } from "@repo/ui/components/num";
import { SearchInput } from "@repo/ui/components/search-input";
import { StatusBadge, type StatusTone } from "@repo/ui/components/status-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
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
import { useParamSeed } from "@/lib/api/use-param-seed";
import { asKey } from "@/lib/i18n/keys";

const ANY = "__any__";

const STATUS_TONE: Record<string, StatusTone> = {
  paid: "paid",
  failed: "rejected",
  pending: "pending",
  expired: "neutral",
};

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
  const locale = useLocale() as Locale;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [gateway, setGateway] = useState<string | null>(null);
  const [method, setMethod] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);

  useParamSeed("q", setQ);

  const resource = `${apiBase}/payment-intents`;
  const { query, result } = useList({
    resource,
    filters: [
      ...(q ? [{ field: "q", operator: "eq" as const, value: q }] : []),
      ...(status ? [{ field: "status", operator: "eq" as const, value: status }] : []),
      ...(gateway ? [{ field: "gateway", operator: "eq" as const, value: gateway }] : []),
      ...(method ? [{ field: "method", operator: "eq" as const, value: method }] : []),
    ],
    pagination: { currentPage: page, pageSize: 20 },
  });

  const rows = (result?.data ?? []) as IntentRow[];
  const total = (result?.total ?? 0) as number;
  const pageCount = Math.max(1, Math.ceil(total / 20));

  const { result: detail } = useOne({
    resource,
    id: detailId ?? "",
    queryOptions: { enabled: !!detailId },
  });
  const d = ((detail as any)?.data ?? detail) as any;

  const filter = (
    anyLabel: string,
    value: string | null,
    set: (v: string | null) => void,
    options: string[],
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

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        title={t("paymentIntents.title")}
        description={t("paymentIntents.subtitle")}
        rule
      />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rule bg-sheet px-4 py-3 shadow-[var(--lift)]">
        <SearchInput
          className="min-w-64 flex-1"
          placeholder={t("paymentIntents.searchPlaceholder")}
          value={q}
          onValueChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          onClear={() => setQ("")}
          clearLabel={t("paymentIntents.clearSearch")}
        />
        {filter(t("paymentIntents.anyStatus"), status, setStatus, ["pending", "paid", "failed", "expired"], (o) =>
          t(asKey(`status.${o}`)),
        )}
        {filter(t("paymentIntents.anyGateway"), gateway, setGateway, ["mock", "paymob"], (o) =>
          t(asKey(`gateways.${o}`)),
        )}
        {filter(t("paymentIntents.anyMethod"), method, setMethod, ["card", "wallet"], (o) =>
          t(asKey(`methods.${o}`)),
        )}
      </div>

      {query.isLoading ? (
        <PageSpinner label={t("paymentIntents.loading")} />
      ) : query.isError ? (
        (() => {
          const denied = (query.error as { statusCode?: number } | null)?.statusCode === 403;
          return (
            <EmptyState
              tone={denied ? "denied" : "error"}
              icon={TriangleAlert}
              title={t(denied ? "paymentIntents.deniedTitle" : "paymentIntents.loadError")}
              description={t(denied ? "paymentIntents.deniedBody" : "paymentIntents.loadErrorBody")}
              action={
                denied ? undefined : (
                  <Button variant="outline" onClick={() => query.refetch()}>
                    <RefreshCcw className="size-4" aria-hidden="true" />
                    {t("paymentIntents.retry")}
                  </Button>
                )
              }
            />
          );
        })()
      ) : rows.length === 0 ? (
        <EmptyState
          tone="empty"
          icon={CreditCard}
          title={t("paymentIntents.notFound")}
          description={t("paymentIntents.emptyBody")}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-rule bg-sheet shadow-[var(--lift)]">
          <Table>
            <TableHeader>
              <TableRow className="border-rule bg-field hover:bg-field">
                {[
                  "student",
                  "course",
                  "center",
                  "amount",
                  "method",
                  "gateway",
                  "status",
                  "created",
                ].map((h) => (
                  <TableHead key={h} className="h-[34px] px-3">
                    <Eyebrow locale={locale} marker={false}>
                      {t(asKey(`paymentIntents.${h}`))}
                    </Eyebrow>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer border-rule-2"
                  onClick={() => setDetailId(r.id)}
                >
                  <TableCell className="px-3 py-[7px]">
                    <IdentityCell
                      initials={initialsOf(r.studentName ?? r.payerName ?? "—")}
                      name={r.studentName ?? r.payerName ?? "—"}
                      meta={
                        r.studentEmail ? (
                          <Num.Code>{r.studentEmail}</Num.Code>
                        ) : r.payerEmail ? (
                          <Num.Code>{r.payerEmail}</Num.Code>
                        ) : undefined
                      }
                    />
                  </TableCell>
                  <TableCell className="px-3 py-[7px] text-[13px]">
                    {r.courseTitle ??
                      (r.purpose && r.purpose !== "subscription"
                        ? t(asKey(`paymentIntents.purpose_${r.purpose}`))
                        : "—")}
                  </TableCell>
                  <TableCell className="px-3 py-[7px] text-[13px]">{r.centerName ?? "—"}</TableCell>
                  <TableCell className="px-3 py-[7px]">
                    <Num.Money
                      piasters={r.amount}
                      locale={locale}
                      tone={r.status === "paid" ? "net" : "muted"}
                      sign={false}
                    />
                  </TableCell>
                  <TableCell className="px-3 py-[7px] text-[13px]">
                    {t(asKey(`methods.${r.method}`))}
                  </TableCell>
                  <TableCell className="px-3 py-[7px] text-[13px]">
                    {t(asKey(`gateways.${r.gateway}`))}
                  </TableCell>
                  <TableCell className="px-3 py-[7px]">
                    <StatusBadge
                      tone={STATUS_TONE[r.status] ?? "neutral"}
                      reason={r.status === "failed" ? r.failureReason : undefined}
                    >
                      {t(asKey(`status.${r.status}`))}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="px-3 py-[7px]">
                    <Num.Date value={r.createdAt} locale={locale} className="text-[11px] text-ink-3" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {pageCount > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-field px-[18px] py-3">
              <Num className="text-[11px] text-ink-3">
                {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} / {total}
              </Num>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t("paymentIntents.prev")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("paymentIntents.next")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

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
                  tone={STATUS_TONE[d.status] ?? "neutral"}
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
    </div>
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
