"use client";

import { useState } from "react";
import { useList, useOne } from "@refinedev/core";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { SearchInput } from "@repo/ui/components/search-input";
import { Card, CardContent } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Num } from "@repo/ui/components/num";
import type { Locale } from "@repo/ui/lib/format";
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

const ANY = "__any__";

export function WhatsAppMessagesScreen() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<MessageRow | null>(null);
  // params (the child's name and student code) and the provider payload belong to
  // the one row an operator opens, so they are fetched then — not shipped with every
  // row in the list.
  const { result: detailResult } = useOne({
    resource: "admin/whatsapp-messages",
    id: detail?.id ?? "",
    queryOptions: { enabled: !!detail },
  });
  const full = detailResult?.data as
    | { params: string[] | null; providerResponse: unknown; error: string | null }
    | undefined;

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
          <SearchInput
            className="min-w-64 flex-1"
            placeholder={t("whatsapp.searchPlaceholder")}
            value={q}
            onValueChange={(v) => {
                setQ(v);
                setPage(1);
              }}
            onClear={() => setQ("")}
            clearLabel={t("whatsapp.clearSearch")}
          />
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
                    <TableCell colSpan={5} className="py-8 text-center text-ink-2">
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
                      <TableCell className="text-sm text-ink-2">
                        <Num.Date value={r.createdAt} locale={locale} className="text-[11px] text-ink-3" />
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
        <span className="text-sm text-ink-2">
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
            <Num>{page} / {pageCount}</Num>
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
                <pre className="mt-1 overflow-x-auto rounded bg-field p-2 text-xs" dir="ltr">
                  {full ? JSON.stringify(full.params, null, 2) : "…"}
                </pre>
              </div>
              {full?.error ? (
                <p className="text-red">{full.error}</p>
              ) : null}
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
    </div>
  );
}
