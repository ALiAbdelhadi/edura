"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Eye, MessageSquare, ShieldAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Badge } from "@repo/ui/components/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { ScrollArea } from "@repo/ui/components/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { Num } from "@repo/ui/components/num";
import type { Locale } from "@repo/ui/lib/format";
import type { ColumnDef } from "@/components/kit/data-table";
import { ListFilter, ListSearch, ListShell } from "@/components/kit/list-shell";
import { PageHeader } from "@/components/kit/page-header";
import { Spinner } from "@/components/kit/spinner";
import { api } from "@/lib/api/client";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { asKey } from "@/lib/i18n/keys";
import { useAction } from "@/lib/api/use-action";
import { useListScreen } from "@/lib/api/use-list-screen";

const PAGE_SIZE = 20;
const REPORT_STATUSES = ["open", "reviewing", "actioned", "dismissed"] as const;
const FILTER_ROLES = [
  "student",
  "parent",
  "teacher",
  "assistant",
  "center_admin",
  "center_staff",
] as const;

function useRoleLabel() {
  const t = useTranslations();
  return (role: string | null | undefined) =>
    role ? t(asKey(`roles.${role}`)) : null;
}

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
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList variant="line" className="w-full justify-start border-b border-border">
          {(["log", "reports", "blocks"] as Tab[]).map((x) => (
            <TabsTrigger key={x} value={x} className="flex-none px-4 py-2">
              {t(`adminMessaging.tabs.${x}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="log" className="mt-4">
          <LogTab />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <ReportsTab />
        </TabsContent>
        <TabsContent value="blocks" className="mt-4">
          <BlocksTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LogTab() {
  const t = useTranslations();
  const roleLabel = useRoleLabel();
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState<ConversationRow | null>(null);

  const list = useListScreen<ConversationRow>({
    resource: "admin/messaging/conversations",
    pageSize: PAGE_SIZE,
  });
  const minorsOnly = list.filter("minorsOnly") === "true";

  const columns: ColumnDef<ConversationRow, unknown>[] = [
    {
      id: "participants",
      header: t("adminMessaging.participants"),
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {row.original.participants.map((p) => (
            <Badge key={p.id} variant="secondary" className="text-[11px]">
              {p.name ?? p.id.slice(0, 8)}
              {p.role ? ` · ${roleLabel(p.role)}` : ""}
            </Badge>
          ))}
          {row.original.involvesMinor ? (
            <Badge variant="destructive" className="text-[10px]">
              {t("adminMessaging.minorBadge")}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      id: "messages",
      header: t("adminMessaging.messages"),
      cell: ({ row }) => row.original.messageCount,
    },
    {
      id: "lastActivity",
      header: t("adminMessaging.lastActivity"),
      cell: ({ row }) => (
        <Num.Date
          value={row.original.lastMessageAt}
          locale={locale}
          className="text-[11px] text-ink-3"
        />
      ),
    },
    {
      id: "view",
      header: "",
      meta: { align: "end", srLabel: t("adminMessaging.view") },
      cell: ({ row }) => (
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(row.original)}>
          <Eye className="size-3.5" />
          {t("adminMessaging.view")}
        </Button>
      ),
    },
  ];

  return (
    <ListShell
      list={list}
      columns={columns}
      toolbar={
        <>
          <ListSearch
            list={list}
            placeholder={t("adminMessaging.searchPlaceholder")}
            clearLabel={t("adminMessaging.searchPlaceholder")}
          />
          <ListFilter
            list={list}
            name="role"
            anyLabel={t("adminMessaging.anyRole")}
            options={FILTER_ROLES}
            render={(r) => roleLabel(r) ?? r}
          />
          <Button
            type="button"
            size="sm"
            variant={minorsOnly ? "default" : "outline"}
            aria-pressed={minorsOnly}
            onClick={() => list.setFilter("minorsOnly", minorsOnly ? null : "true")}
          >
            <ShieldAlert className="size-4" />
            {t("adminMessaging.minorsOnly")}
          </Button>
        </>
      }
      emptyIcon={MessageSquare}
      emptyTitle={t("adminMessaging.noResults")}
    >
      <ThreadDialog row={open} onClose={() => setOpen(null)} />
    </ListShell>
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
  const roleLabel = useRoleLabel();
  const locale = useLocale() as Locale;
  const queryStrings = useQueryStrings();
  const [messages, setMessages] = useState<ThreadMessage[] | "error" | null>(null);
  const { run, busyKey } = useAction({ method: "delete" });

  const removeMessage = async (messageId: string) => {
    const res = await run({
      url: `admin/messaging/messages/${messageId}`,
      values: { scope: "direct" },
      key: messageId,
      successMsg: t("adminMessaging.removedToast"),
    });
    if (!res.ok) throw res.error;
    if (row) await load(row.id);
  };

  const load = useCallback(async (id: string) => {
    setMessages(null);
    try {
      const res = await api
        .get(`admin/messaging/conversations/${id}`)
        .json<{ data: { messages: ThreadMessage[] } }>();
      setMessages(res.data.messages);
    } catch {
      setMessages("error");
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
          ) : messages === "error" ? (
            <LoadError
              message={queryStrings.loadFailed}
              onRetry={() => row && void load(row.id)}
              retryLabel={queryStrings.retry}
            />
          ) : (
            <div className="flex flex-col gap-2 pe-2">
              {messages.map((m) => {
                const sender = row?.participants.find((p) => p.id === m.senderId);
                return (
                  <div key={m.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-2 text-xs text-ink-2">
                      <span className="font-medium text-ink">
                        {sender?.name ?? m.senderId.slice(0, 8)}
                        {sender?.role ? ` · ${roleLabel(sender.role)}` : ""}
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
                    ) : (
                      // Removal hides the message from its participants; the row
                      // and its original body are retained, which is why the
                      // badge above can still say so.
                      <ConfirmDialog
                        trigger={
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="mt-1 h-7 text-red"
                            disabled={busyKey === m.id}
                          >
                            {t("adminMessaging.removeMessage")}
                          </Button>
                        }
                        destructive
                        title={t("adminMessaging.removeTitle")}
                        description={t("adminMessaging.removeBody")}
                        confirmText={t("adminMessaging.removeMessage")}
                        onConfirm={() => removeMessage(m.id)}
                      />
                    )}
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
  const roleLabel = useRoleLabel();
  const locale = useLocale() as Locale;

  const list = useListScreen<ReportRow>({
    resource: "admin/messaging/reports",
    pageSize: PAGE_SIZE,
    initialFilters: { status: "open" },
  });

  const { run, busyKey: busy } = useAction({
    method: "patch",
    onSuccess: () => list.query.refetch(),
  });

  const resolve = (id: string, next: ReportRow["status"]) =>
    run({
      url: `admin/messaging/reports/${id}`,
      values: { status: next },
      key: id,
      successMsg:
        next === "dismissed"
          ? t("adminMessaging.dismissedToast")
          : t("adminMessaging.actionedToast"),
    });

  const columns: ColumnDef<ReportRow, unknown>[] = [
    {
      id: "category",
      header: t("adminMessaging.reportCategory"),
      cell: ({ row }) => (
        <>
          <div className="flex items-center gap-2">
            <span>{row.original.category}</span>
            {row.original.involvesMinor ? (
              <Badge variant="destructive" className="text-[10px]">
                {t("adminMessaging.minorBadge")}
              </Badge>
            ) : null}
          </div>
          {row.original.details ? (
            <p className="mt-1 max-w-md text-xs text-ink-2">{row.original.details}</p>
          ) : null}
        </>
      ),
    },
    {
      id: "reporter",
      header: t("adminMessaging.reporter"),
      cell: ({ row }) => (
        <span className="text-xs">
          {row.original.reporter?.name} · {roleLabel(row.original.reporter?.role)}
        </span>
      ),
    },
    {
      id: "reported",
      header: t("adminMessaging.reported"),
      cell: ({ row }) => (
        <span className="text-xs">
          {row.original.reported?.name} · {roleLabel(row.original.reported?.role)}
        </span>
      ),
    },
    {
      id: "filed",
      header: t("adminMessaging.filed"),
      cell: ({ row }) => (
        <Num.Date
          value={row.original.createdAt}
          locale={locale}
          className="text-[11px] text-ink-3"
        />
      ),
    },
    {
      id: "decide",
      header: "",
      meta: { align: "end", srLabel: t("adminMessaging.markActioned") },
      cell: ({ row }) =>
        row.original.status === "open" || row.original.status === "reviewing" ? (
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy === row.original.id}
              onClick={() => void resolve(row.original.id, "actioned")}
            >
              {t("adminMessaging.markActioned")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy === row.original.id}
              onClick={() => void resolve(row.original.id, "dismissed")}
            >
              {t("adminMessaging.dismiss")}
            </Button>
          </div>
        ) : (
          <Badge variant="secondary" className="text-[10px]">
            {t(asKey(`adminMessaging.reportStatus.${row.original.status}`))}
          </Badge>
        ),
    },
  ];

  return (
    <ListShell
      list={list}
      columns={columns}
      toolbar={
        <ListFilter
          list={list}
          name="status"
          anyLabel={t("adminMessaging.allStatuses")}
          options={REPORT_STATUSES}
          render={(s) => t(asKey(`adminMessaging.reportStatus.${s}`))}
        />
      }
      emptyIcon={ShieldAlert}
      emptyTitle={t("adminMessaging.noReports")}
    />
  );
}

function BlocksTab() {
  const t = useTranslations();
  const locale = useLocale() as Locale;

  const list = useListScreen<BlockRow>({
    resource: "admin/messaging/blocks",
    pageSize: PAGE_SIZE,
  });

  const columns: ColumnDef<BlockRow, unknown>[] = [
    {
      id: "blocker",
      header: t("adminMessaging.blocker"),
      cell: ({ row }) => row.original.blocker,
    },
    {
      id: "blocked",
      header: t("adminMessaging.blocked"),
      cell: ({ row }) => row.original.blocked,
    },
    {
      id: "reason",
      header: t("adminMessaging.reason"),
      cell: ({ row }) => (
        <span className="text-xs text-ink-2">{row.original.reason ?? "—"}</span>
      ),
    },
    {
      id: "filed",
      header: t("adminMessaging.filed"),
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
      columns={columns}
      emptyIcon={Ban}
      emptyTitle={t("adminMessaging.noBlocks")}
    />
  );
}
