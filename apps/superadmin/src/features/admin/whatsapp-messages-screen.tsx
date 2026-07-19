"use client";

import { useState } from "react";
import { useList } from "@refinedev/core";
import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
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
import { PageHeader } from "@/components/kit/page-header";
import { StatusBadge } from "@/components/kit/status-badge";
import { Spinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";

type MessageRow = {
  id: string;
  recipientPhone: string;
  template: string;
  params: string[] | null;
  locale: string;
  status: "queued" | "sent" | "failed";
  provider: "mock" | "cloud_api";
  providerMessageId: string | null;
  providerResponse: unknown;
  error: string | null;
  createdAt: string;
};

const ANY = "__any__";

/** Step 7: WhatsApp delivery log (every attempt, mock included). */
export function WhatsAppMessagesScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<MessageRow | null>(null);

  const { query, result } = useList({
    resource: "admin/whatsapp-messages",
    filters: [
      ...(q ? [{ field: "q", operator: "eq" as const, value: q }] : []),
      ...(status ? [{ field: "status", operator: "eq" as const, value: status }] : []),
    ],
    pagination: { currentPage: page, pageSize: 20 },
  });

  const rows = (result?.data ?? []) as MessageRow[];
  const total = (result?.total ?? 0) as number;
  const pageCount = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-6">
      <PageHeader title={t("whatsapp.title")} description={t("whatsapp.description")} />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute inset-inline-start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("whatsapp.searchPlaceholder")}
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
                aria-label={t("whatsapp.clearSearch")}
                onClick={() => setQ("")}
                className="absolute inset-inline-end-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <Select
            value={status ?? undefined}
            onValueChange={(v) => {
              setStatus(v === ANY ? null : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t("whatsapp.statusFilter")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("whatsapp.any")}</SelectItem>
              {["sent", "failed", "queued"].map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="p-6">
              <Spinner />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("whatsapp.colRecipient")}</TableHead>
                  <TableHead>{t("whatsapp.colTemplate")}</TableHead>
                  <TableHead>{t("whatsapp.colStatus")}</TableHead>
                  <TableHead>{t("whatsapp.colProvider")}</TableHead>
                  <TableHead>{t("whatsapp.colAt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      {t("whatsapp.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => setDetail(r)}
                    >
                      <TableCell className="font-mono" dir="ltr">
                        {r.recipientPhone}
                      </TableCell>
                      <TableCell>{r.template}</TableCell>
                      <TableCell>
                        <StatusBadge
                          tone={
                            r.status === "sent"
                              ? "success"
                              : r.status === "failed"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {r.status}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>{r.provider}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(r.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {t("whatsapp.total", { count: total })}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t("whatsapp.prev")}
          </Button>
          <span className="self-center text-sm">
            {page} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("whatsapp.next")}
          </Button>
        </div>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.template}</DialogTitle>
          </DialogHeader>
          {detail ? (
            <div className="space-y-3 text-sm">
              <div dir="ltr" className="font-mono">{detail.recipientPhone}</div>
              <div>
                <span className="font-medium">{t("whatsapp.detailParams")}: </span>
                <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs" dir="ltr">
                  {JSON.stringify(detail.params, null, 2)}
                </pre>
              </div>
              {detail.error ? (
                <p className="text-destructive">{detail.error}</p>
              ) : null}
              <div>
                <span className="font-medium">{t("whatsapp.detailResponse")}: </span>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-xs" dir="ltr">
                  {JSON.stringify(detail.providerResponse, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
