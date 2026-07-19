"use client";

import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner } from "@/components/kit/spinner";
import { StatusBadge } from "@/components/kit/status-badge";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useList, useOne } from "@refinedev/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { CreditCard, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

const ANY = "__any__";

const STATUS_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  paid: "success",
  failed: "danger",
  pending: "warning",
  expired: "neutral",
};

type IntentRow = {
  id: string;
  studentName: string | null;
  studentEmail: string | null;
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
  const { formatEGP, formatDate } = useFormatters();
  const t = useTranslations();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [gateway, setGateway] = useState<string | null>(null);
  const [method, setMethod] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);

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
  // Data-provider getOne unwraps the envelope; be tolerant of either shape.
  const d = ((detail as any)?.data ?? detail) as any;

  const filterSelect = (
    label: string,
    value: string | null,
    set: (v: string | null) => void,
    options: string[],
  ) => (
    <Select
      value={value ?? undefined}
      onValueChange={(v) => {
        set(v === ANY ? null : v);
        setPage(1);
      }}
    >
      <SelectTrigger className="w-36">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{label}: any</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t("paymentIntents.title")} />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute inset-inline-start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("paymentIntents.searchPlaceholder")}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              className="ps-9 pe-9"
            />
            {q && (
              <button
                type="button"
                aria-label={t("paymentIntents.clearSearch")}
                onClick={() => setQ("")}
                className="absolute inset-inline-end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          {filterSelect(t("paymentIntents.status"), status, setStatus, ["pending", "paid", "failed", "expired"])}
          {filterSelect(t("paymentIntents.gateway"), gateway, setGateway, ["mock", "paymob"])}
          {filterSelect(t("paymentIntents.method"), method, setMethod, ["card", "wallet"])}
        </CardContent>
      </Card>
      {query.isLoading && <PageSpinner label={t("paymentIntents.loading")} />}
      {!query.isLoading && rows.length === 0 && (
        <EmptyState icon={CreditCard} title={t("paymentIntents.notFound")} />
      )}
      {rows.length > 0 && (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("paymentIntents.student")}</TableHead>
                <TableHead>{t("paymentIntents.course")}</TableHead>
                <TableHead>{t("paymentIntents.center")}</TableHead>
                <TableHead>{t("paymentIntents.amount")}</TableHead>
                <TableHead>{t("paymentIntents.method")}</TableHead>
                <TableHead>{t("paymentIntents.gateway")}</TableHead>
                <TableHead>{t("paymentIntents.status")}</TableHead>
                <TableHead>{t("paymentIntents.created")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => setDetailId(r.id)}
                >
                  <TableCell>
                    <div className="font-medium">{r.studentName ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.studentEmail}</div>
                  </TableCell>
                  <TableCell>{r.courseTitle ?? "—"}</TableCell>
                  <TableCell>{r.centerName ?? "—"}</TableCell>
                  <TableCell className="font-semibold">{formatEGP(r.amount)}</TableCell>
                  <TableCell>{r.method}</TableCell>
                  <TableCell>{r.gateway}</TableCell>
                  <TableCell>
                    <StatusBadge tone={STATUS_TONE[r.status] ?? "neutral"}>
                      {r.status}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(r.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {t("paymentIntents.pageInfo", { page, pageCount, total })}
          </span>
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
      <Dialog open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("paymentIntents.intentDetail")}</DialogTitle>
          </DialogHeader>
          {d ? (
            <div className="space-y-4 text-sm">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <dt className="text-muted-foreground">{t("paymentIntents.intentId")}</dt>
                <dd className="font-mono text-xs">{d.id}</dd>
                <dt className="text-muted-foreground">{t("paymentIntents.student")}</dt>
                <dd>
                  {d.student?.name} <span className="text-muted-foreground">({d.student?.email})</span>
                </dd>
                <dt className="text-muted-foreground">{t("paymentIntents.course")}</dt>
                <dd>{d.course?.title ?? "—"}</dd>
                <dt className="text-muted-foreground">{t("paymentIntents.center")}</dt>
                <dd>{d.center?.name ?? "—"}</dd>
                <dt className="text-muted-foreground">{t("paymentIntents.amount")}</dt>
                <dd className="font-semibold">{formatEGP(d.amount)}</dd>
                <dt className="text-muted-foreground">{t("paymentIntents.methodGateway")}</dt>
                <dd>
                  {d.method} / {d.gateway}
                </dd>
                <dt className="text-muted-foreground">{t("paymentIntents.status")}</dt>
                <dd>
                  <StatusBadge tone={STATUS_TONE[d.status] ?? "neutral"}>
                    {d.status}
                  </StatusBadge>
                  {d.failureReason ? (
                    <span className="ms-2 text-destructive">{d.failureReason}</span>
                  ) : null}
                </dd>
                <dt className="text-muted-foreground">{t("paymentIntents.gatewayOrderRef")}</dt>
                <dd className="font-mono text-xs">
                  {d.gatewayOrderId ?? "—"} / {d.gatewayRef ?? "—"}
                </dd>
                <dt className="text-muted-foreground">{t("paymentIntents.receipt")}</dt>
                <dd>{d.payment?.receiptNumber ?? "—"}</dd>
                <dt className="text-muted-foreground">{t("paymentIntents.ledgerTxn")}</dt>
                <dd>{d.transaction?.refNumber ?? "—"}</dd>
                <dt className="text-muted-foreground">{t("paymentIntents.createdPaid")}</dt>
                <dd>
                  {formatDate(d.createdAt)}
                  {d.paidAt ? ` → ${formatDate(d.paidAt)}` : ""}
                </dd>
              </dl>
              {d.webhookPayload ? (
                <div>
                  <div className="mb-1 text-muted-foreground">{t("paymentIntents.rawWebhook")}</div>
                  <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
                    {JSON.stringify(d.webhookPayload, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : (
            <PageSpinner label={t("common.loading")} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}