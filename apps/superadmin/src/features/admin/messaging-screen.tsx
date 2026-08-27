"use client";

import { useCallback, useEffect, useState } from "react";
import { useList } from "@refinedev/core";
import { Eye, ShieldAlert, Ban } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { SearchInput } from "@repo/ui/components/search-input";
import { Badge } from "@repo/ui/components/badge";
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
import { ScrollArea } from "@repo/ui/components/scroll-area";
import { Num } from "@repo/ui/components/num";
import type { Locale } from "@repo/ui/lib/format";
import { cn } from "@repo/ui/lib/utils";
import { PageHeader } from "@/components/kit/page-header";
import { Spinner } from "@/components/kit/spinner";
import { api } from "@/lib/api/client";

const ANY = "__any__";
const PAGE_SIZE = 20;
const REPORT_STATUSES = ["open", "reviewing", "actioned", "dismissed"] as const;

type Participant = { id: string; name: string | null; role: string | null };

type ConversationRow = {
  id: string;
  participants: Participant[];
  centerId: string | null;
  lastMessageAt: string;
  messageCount: number;
  involvesMinor: boolean;
  createdAt: string;
};

type ThreadMessage = {
  id: string;
  senderId: string;
  body: string;
  originalBody: string;
  createdAt: string;
  deleted: boolean;
};

type ReportRow = {
  id: string;
  category: string;
  details: string | null;
  status: "open" | "reviewing" | "actioned" | "dismissed";
  involvesMinor: boolean;
  createdAt: string;
  reporter: Participant | null;
  reported: Participant | null;
};

type BlockRow = {
  id: string;
  blocker: string | null;
  blocked: string | null;
  reason: string | null;
  createdAt: string;
  removedAt: string | null;
};

type Tab = "log" | "reports" | "blocks";

export function MessagingScreen() {
  const t = useTranslations();
  const [tab, setTab] = useState<Tab>("log");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("adminMessaging.title")}
        description={t("adminMessaging.description")}
      />
      <div className="flex gap-2 border-b border-border">
        {(["log", "reports", "blocks"] as Tab[]).map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setTab(x)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === x
                ? "border-indigo text-ink"
                : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {t(`adminMessaging.tabs.${x}`)}
          </button>
        ))}
      </div>
      {tab === "log" ? <LogTab /> : tab === "reports" ? <ReportsTab /> : <BlocksTab />}
    </div>
  );
}

function LogTab() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [q, setQ] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [minorsOnly, setMinorsOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ConversationRow | null>(null);

  const { query, result } = useList({
    resource: "admin/messaging/conversations",
    filters: [
      ...(q ? [{ field: "q", operator: "eq" as const, value: q }] : []),
      ...(role ? [{ field: "role", operator: "eq" as const, value: role }] : []),
      ...(minorsOnly
        ? [{ field: "minorsOnly", operator: "eq" as const, value: "true" }]
        : []),
    ],
    pagination: { currentPage: page, pageSize: PAGE_SIZE },
  });

  const rows = (result?.data ?? []) as ConversationRow[];
  const total = (result?.total ?? 0) as number;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <SearchInput
            className="min-w-64 flex-1"
            placeholder={t("adminMessaging.searchPlaceholder")}
            value={q}
            onValueChange={(v) => {
                setQ(v);
                setPage(1);
              }}
          />
          <Select
            value={role ?? ANY}
            onValueChange={(v) => {
              setRole(v === ANY ? null : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t("adminMessaging.anyRole")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("adminMessaging.anyRole")}</SelectItem>
              {["student", "parent", "teacher", "assistant", "center_admin", "center_staff"].map(
                (r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant={minorsOnly ? "default" : "outline"}
            onClick={() => {
              setMinorsOnly((v) => !v);
              setPage(1);
            }}
          >
            <ShieldAlert className="size-4" />
            {t("adminMessaging.minorsOnly")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("adminMessaging.participants")}</TableHead>
                  <TableHead>{t("adminMessaging.messages")}</TableHead>
                  <TableHead>{t("adminMessaging.lastActivity")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {r.participants.map((p) => (
                          <Badge key={p.id} variant="secondary" className="text-[11px]">
                            {p.name ?? p.id.slice(0, 8)} · {p.role}
                          </Badge>
                        ))}
                        {r.involvesMinor ? (
                          <Badge variant="destructive" className="text-[10px]">
                            {t("adminMessaging.minorBadge")}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{r.messageCount}</TableCell>
                    <TableCell><Num.Date value={r.lastMessageAt} locale={locale} className="text-[11px] text-ink-3" /></TableCell>
                    <TableCell className="text-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setOpen(r)}
                      >
                        <Eye className="size-3.5" />
                        {t("adminMessaging.view")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-ink-2">
                      {t("adminMessaging.noResults")}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {pageCount > 1 ? (
        <div className="flex items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ‹
          </Button>
          <span className="text-sm text-ink-2">
            <Num>{page} / {pageCount}</Num>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            ›
          </Button>
        </div>
      ) : null}

      <ThreadDialog row={open} onClose={() => setOpen(null)} />
    </>
  );
}

function ThreadDialog({
  row,
  onClose,
}: {
  row: ConversationRow | null;
  onClose: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);

  const load = useCallback(async (id: string) => {
    setMessages(null);
    try {
      const res = await api
        .get(`admin/messaging/conversations/${id}`)
        .json<{ data: { messages: ThreadMessage[] } }>();
      setMessages(res.data.messages);
    } catch {
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    if (row) void load(row.id);
  }, [row, load]);

  return (
    <Dialog open={!!row} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("adminMessaging.threadTitle")}</DialogTitle>
        </DialogHeader>
        <p className="rounded-md bg-field px-3 py-2 text-xs text-ink-2">
          {t("adminMessaging.auditNotice")}
        </p>
        <ScrollArea className="max-h-[60vh]">
          {!messages ? (
            <div className="flex justify-center p-6">
              <Spinner />
            </div>
          ) : (
            <div className="flex flex-col gap-2 pe-2">
              {messages.map((m) => {
                const sender = row?.participants.find((p) => p.id === m.senderId);
                return (
                  <div key={m.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-2 text-xs text-ink-2">
                      <span className="font-medium text-ink">
                        {sender?.name ?? m.senderId.slice(0, 8)}
                        {sender?.role ? ` · ${sender.role}` : ""}
                      </span>
                      <Num.Date value={m.createdAt} locale={locale} className="text-[11px] text-ink-3" />
                    </div>
                    <p className="mt-1 break-words whitespace-pre-wrap text-sm">
                      {m.originalBody}
                    </p>
                    {m.deleted ? (
                      <Badge variant="outline" className="mt-2 text-[10px]">
                        {t("adminMessaging.removedButRetained")}
                      </Badge>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function ReportsTab() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [status, setStatus] = useState<string | null>("open");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);

  const { query, result } = useList({
    resource: "admin/messaging/reports",
    filters: status
      ? [{ field: "status", operator: "eq" as const, value: status }]
      : [],
    pagination: { currentPage: page, pageSize: PAGE_SIZE },
  });

  const rows = (result?.data ?? []) as ReportRow[];

  const resolve = async (id: string, next: ReportRow["status"]) => {
    setBusy(id);
    try {
      await api.patch(`admin/messaging/reports/${id}`, { json: { status: next } });
      await query.refetch();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select
            value={status ?? ANY}
            onValueChange={(v) => {
              setStatus(v === ANY ? null : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("adminMessaging.allStatuses")}</SelectItem>
              {REPORT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`adminMessaging.reportStatus.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("adminMessaging.reportCategory")}</TableHead>
                  <TableHead>{t("adminMessaging.reporter")}</TableHead>
                  <TableHead>{t("adminMessaging.reported")}</TableHead>
                  <TableHead>{t("adminMessaging.filed")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className={cn(r.involvesMinor && "bg-destructive/5")}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{r.category}</span>
                        {r.involvesMinor ? (
                          <Badge variant="destructive" className="text-[10px]">
                            {t("adminMessaging.minorBadge")}
                          </Badge>
                        ) : null}
                      </div>
                      {r.details ? (
                        <p className="mt-1 max-w-md text-xs text-ink-2">
                          {r.details}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.reporter?.name} · {r.reporter?.role}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.reported?.name} · {r.reported?.role}
                    </TableCell>
                    <TableCell><Num.Date value={r.createdAt} locale={locale} className="text-[11px] text-ink-3" /></TableCell>
                    <TableCell className="text-end">
                      {r.status === "open" || r.status === "reviewing" ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy === r.id}
                            onClick={() => void resolve(r.id, "actioned")}
                          >
                            {t("adminMessaging.markActioned")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy === r.id}
                            onClick={() => void resolve(r.id, "dismissed")}
                          >
                            {t("adminMessaging.dismiss")}
                          </Button>
                        </div>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          {t(`adminMessaging.reportStatus.${r.status}`)}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-ink-2">
                      {t("adminMessaging.noReports")}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function BlocksTab() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [page, setPage] = useState(1);

  const { query, result } = useList({
    resource: "admin/messaging/blocks",
    pagination: { currentPage: page, pageSize: PAGE_SIZE },
  });
  const rows = (result?.data ?? []) as BlockRow[];

  return (
    <Card>
      <CardContent className="p-0">
        {query.isLoading ? (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("adminMessaging.blocker")}</TableHead>
                <TableHead>{t("adminMessaging.blocked")}</TableHead>
                <TableHead>{t("adminMessaging.reason")}</TableHead>
                <TableHead>{t("adminMessaging.filed")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.blocker}</TableCell>
                  <TableCell>{r.blocked}</TableCell>
                  <TableCell className="text-xs text-ink-2">
                    {r.reason ?? "—"}
                  </TableCell>
                  <TableCell><Num.Date value={r.createdAt} locale={locale} className="text-[11px] text-ink-3" /></TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-ink-2">
                    <div className="flex flex-col items-center gap-2">
                      <Ban className="size-5 opacity-50" />
                      {t("adminMessaging.noBlocks")}
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
