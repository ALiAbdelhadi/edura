"use client";

// Shared 1:1 chat module — the SAME component serves every role (student,
// parent, teacher, assistant, center admin, super admin). Role-specific
// behavior comes from the server: the contacts directory and the conversation
// matrix are enforced in the backend; this UI just renders what it is allowed
// to see. Live updates flow through useChat (Socket.IO), with REST fallback.
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useGetIdentity } from "@refinedev/core";
import { AlertCircle, Ban, Check, CheckCheck, ChevronUp, Clock3, Eye, Flag, MessageSquare, MoreVertical, Plus, Send, ShieldAlert, User, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@repo/ui/components/card";
import { SearchInput } from "@repo/ui/components/search-input";
import { Input } from "@repo/ui/components/input";
import { Button } from "@repo/ui/components/button";
import { Badge } from "@repo/ui/components/badge";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { ScrollArea } from "@repo/ui/components/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/dialog";
import { Textarea } from "@repo/ui/components/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { cn } from "@repo/ui/lib/utils";
import { api } from "@/lib/api/client";
import { EmptyState } from "@/components/kit/empty-state";
import { Spinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";
import type { MeResponse } from "@/lib/refine";
import { useChat, type ChatController } from "./use-chat";
import { useGroups } from "./use-groups";
import { GroupPanel } from "./group-panel";
import type { UiMessage, WireContact, WireConversation } from "./chat-types";

export function ChatScreen() {
  const { data: identity } = useGetIdentity<MeResponse>();
  if (!identity?.id) {
    return (
      <Card className="flex min-h-[400px] items-center justify-center">
        <Spinner />
      </Card>
    );
  }
  return <ChatScreenInner meId={identity.id} />;
}

function ChatScreenInner({ meId }: { meId: string }) {
  const t = useTranslations();
  const chat = useChat(meId);
  const groups = useGroups();
  const [tab, setTab] = useState<"direct" | "groups">("direct");

  const groupUnread = groups.groups.reduce((n, g) => n + g.unreadCount, 0);

  return (
    <Card className="gap-0 overflow-hidden p-0">
      {chat.status === "offline" ? (
        <div className="flex items-center gap-2 border-b border-border bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
          <WifiOff className="size-3.5 shrink-0" />
          {t("chat.connectionLost")}
        </div>
      ) : null}

      {/* Direct threads and derived-membership channels are two views of the
          same inbox; keeping them as tabs (not separate screens) means one
          unread story and one nav entry per role. */}
      <div className="flex items-center gap-1 border-b border-border px-3 pt-3">
        <TabButton
          active={tab === "direct"}
          onClick={() => setTab("direct")}
          label={t("chat.tabs.direct")}
        />
        <TabButton
          active={tab === "groups"}
          onClick={() => setTab("groups")}
          label={t("chat.tabs.groups")}
          badge={groupUnread}
        />
      </div>

      <div className="grid h-[calc(100vh-250px)] min-h-[560px] grid-cols-1 md:grid-cols-3">
        {tab === "direct" ? (
          <>
            <ConversationList chat={chat} meId={meId} />
            <ThreadPane chat={chat} meId={meId} />
          </>
        ) : (
          <GroupPanel groups={groups} meId={meId} />
        )}
      </div>
    </Card>
  );
}

function TabButton({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-2 rounded-t-md border-b-2 px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {badge ? (
        <span className="flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-medium text-destructive-foreground">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Conversation list (left pane)
// ---------------------------------------------------------------------------
function ConversationList({
  chat,
  meId,
}: {
  chat: ChatController;
  meId: string;
}) {
  const t = useTranslations();
  const { formatDate } = useFormatters();

  return (
    <div className="flex h-full min-h-0 flex-col border-b border-border md:border-b-0 md:border-e">
      <div className="flex items-center justify-between border-b border-border p-4">
        <span className="font-bold text-foreground">{t("nav.messages")}</span>
        <NewConversationDialog chat={chat} />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {chat.conversationsLoading ? (
          <div className="flex justify-center p-5">
            <Spinner />
          </div>
        ) : chat.conversations.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={MessageSquare}
              title={t("chat.emptyList")}
              description={t("chat.emptyListHint")}
            />
          </div>
        ) : (
          <ul>
            {chat.conversations.map((c) => (
              <ConversationListItem
                key={c.id}
                conversation={c}
                selected={chat.activeId === c.id}
                online={chat.onlineIds.has(c.partner.id)}
                typing={!!chat.typingIn[c.id]}
                mine={c.lastMessageSenderId === meId}
                onClick={() => chat.openConversation(c.id)}
                formatDate={formatDate}
              />
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

function ConversationListItem({
  conversation: c,
  selected,
  online,
  typing,
  mine,
  onClick,
  formatDate,
}: {
  conversation: WireConversation;
  selected: boolean;
  online: boolean;
  typing: boolean;
  mine: boolean;
  onClick: () => void;
  formatDate: (d: string | Date, opts?: Intl.DateTimeFormatOptions) => string;
}) {
  const t = useTranslations();
  return (
    <li
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-center gap-3 border-b border-border px-4 py-3 transition-colors",
        selected ? "bg-accent" : "hover:bg-muted/50",
      )}
    >
      <div className="relative shrink-0">
        <Avatar>
          <AvatarFallback>
            <User className="size-4" />
          </AvatarFallback>
        </Avatar>
        {online ? (
          <span className="absolute -bottom-0.5 -end-0.5 size-3 rounded-full border-2 border-card bg-emerald-500" />
        ) : null}
        {c.unreadCount > 0 ? (
          <span className="absolute -top-1 -end-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-medium text-destructive-foreground">
            {c.unreadCount}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-medium text-foreground">
            {c.partner.name || t("chat.unknownUser")}
          </p>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatDate(c.lastMessageAt, { month: "short", day: "numeric" })}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {c.partner.role ? (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px]">
              {t(`roles.${c.partner.role}`)}
            </span>
          ) : null}
          <span
            className={cn(
              "truncate",
              typing && "text-primary",
              !typing && c.unreadCount > 0 && "font-bold text-foreground",
            )}
          >
            {typing
              ? t("chat.typing")
              : c.lastMessagePreview
                ? (mine ? t("chat.you") : "") + c.lastMessagePreview
                : t("chat.noPreview")}
          </span>
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Thread pane (right pane): header + ScrollArea of messages + composer
// ---------------------------------------------------------------------------
function ThreadPane({ chat, meId }: { chat: ChatController; meId: string }) {
  const t = useTranslations();

  if (!chat.activeId || !chat.activeConversation) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-muted/40 text-center text-muted-foreground md:col-span-2">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MessageSquare className="size-6" />
        </div>
        <p className="text-sm">{t("chat.selectConversation")}</p>
      </div>
    );
  }

  const partner = chat.activeConversation.partner;
  const online = chat.onlineIds.has(partner.id);
  const typing = !!chat.typingIn[chat.activeId];

  return (
    <div className="flex h-full min-h-0 flex-col md:col-span-2">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <div className="relative shrink-0">
          <Avatar>
            <AvatarFallback>
              <User className="size-4" />
            </AvatarFallback>
          </Avatar>
          {online ? (
            <span className="absolute -bottom-0.5 -end-0.5 size-3 rounded-full border-2 border-card bg-emerald-500" />
          ) : null}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <strong className="truncate text-foreground">
              {partner.name || t("chat.unknownUser")}
            </strong>
            {partner.role ? (
              <Badge variant="secondary" className="text-[10px]">
                {t(`roles.${partner.role}`)}
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {typing
              ? t("chat.typing")
              : online
                ? t("chat.online")
                : t("chat.offline")}
          </p>
        </div>
        <div className="ms-auto">
          <SafetyMenu
            conversationId={chat.activeId}
            partnerId={partner.id}
            partnerName={partner.name || t("chat.unknownUser")}
          />
        </div>
      </div>

      {/* DISCLOSURE, not surveillance: when a parent can see this thread BOTH
          participants are told so, on every visit. The adult sees it too. */}
      {chat.oversight?.monitored ? (
        <div className="flex items-center gap-2 border-b border-border bg-sky-500/10 px-4 py-2 text-xs text-sky-800 dark:text-sky-300">
          <Eye className="size-3.5 shrink-0" />
          {chat.oversight.minorParticipantId === meId
            ? t("chat.oversightBannerStudent")
            : t("chat.oversightBanner")}
        </div>
      ) : null}

      <MessageThread chat={chat} meId={meId} />
      <Composer chat={chat} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block / report. Both are server-enforced in the single authorization module;
// this menu is only the entry point.
// ---------------------------------------------------------------------------
function SafetyMenu({
  conversationId,
  partnerId,
  partnerName,
}: {
  conversationId: string | null;
  partnerId: string;
  partnerName: string;
}) {
  const t = useTranslations();
  const [reportOpen, setReportOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const block = async () => {
    if (!window.confirm(t("chat.blockConfirm", { name: partnerName }))) return;
    setBusy(true);
    try {
      await api.post("messages/blocks", {
        json: { userId: partnerId, conversationId: conversationId ?? undefined },
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label={t("chat.report")}
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setReportOpen(true)}>
            <Flag className="size-4" />
            {t("chat.report")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void block()} variant="destructive">
            <Ban className="size-4" />
            {t("chat.block")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        conversationId={conversationId}
        partnerId={partnerId}
      />
    </>
  );
}

const REPORT_CATEGORIES = [
  "harassment",
  "inappropriate",
  "safety_concern",
  "spam",
  "other",
] as const;

function ReportDialog({
  open,
  onOpenChange,
  conversationId,
  partnerId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversationId: string | null;
  partnerId: string;
}) {
  const t = useTranslations();
  const [category, setCategory] =
    useState<(typeof REPORT_CATEGORIES)[number]>("harassment");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (open) {
      setCategory("harassment");
      setDetails("");
      setSent(false);
    }
  }, [open]);

  const submit = async () => {
    setSending(true);
    try {
      await api.post("messages/reports", {
        json: {
          conversationId: conversationId ?? undefined,
          reportedUserId: conversationId ? undefined : partnerId,
          category,
          details: details.trim() || undefined,
        },
      });
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-destructive" />
            {t("chat.reportTitle")}
          </DialogTitle>
        </DialogHeader>
        {sent ? (
          <p className="py-4 text-sm text-muted-foreground">
            {t("chat.reportSent")}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <p className="pb-2 text-sm font-medium">
                {t("chat.reportCategory")}
              </p>
              <div className="flex flex-wrap gap-2">
                {REPORT_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      category === c
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    {t(`chat.reportCategories.${c}`)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="pb-2 text-sm font-medium">
                {t("chat.reportDetails")}
              </p>
              <Textarea
                value={details}
                maxLength={2000}
                rows={4}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>
            <Button type="button" onClick={() => void submit()} disabled={sending}>
              {sending ? <Spinner /> : <Flag className="size-4" />}
              {t("chat.reportSubmit")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MessageThread({ chat, meId }: { chat: ChatController; meId: string }) {
  const t = useTranslations();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const restoreAnchor = useRef<{ height: number; top: number } | null>(null);
  const conversationId = chat.activeId;

  // Auto-scroll to the latest message — on open, and on new messages while
  // the user is already near the bottom (don't yank them while reading old
  // history).
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (restoreAnchor.current) {
      // Older page was prepended: keep the user's position stable.
      viewport.scrollTop =
        viewport.scrollHeight -
        restoreAnchor.current.height +
        restoreAnchor.current.top;
      restoreAnchor.current = null;
      return;
    }
    if (stickToBottom.current) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [chat.messages, conversationId]);

  useEffect(() => {
    stickToBottom.current = true;
  }, [conversationId]);

  const onScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distance =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    stickToBottom.current = distance < 80;
  }, []);

  const handleLoadOlder = useCallback(async () => {
    const viewport = viewportRef.current;
    if (!conversationId || !viewport || loadingOlder) return;
    setLoadingOlder(true);
    restoreAnchor.current = {
      height: viewport.scrollHeight,
      top: viewport.scrollTop,
    };
    try {
      await chat.loadOlder(conversationId);
    } finally {
      setLoadingOlder(false);
    }
  }, [chat, conversationId, loadingOlder]);

  return (
    <ScrollArea
      className="min-h-0 flex-1 bg-muted/40"
      viewportRef={viewportRef}
      onViewportScroll={onScroll}
    >
      <div className="flex w-full flex-col gap-3 p-4">
        {chat.threadLoading && chat.messages.length === 0 ? (
          <div className="flex justify-center p-5">
            <Spinner />
          </div>
        ) : (
          <>
            {chat.hasOlder ? (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={handleLoadOlder}
                  disabled={loadingOlder}
                >
                  {loadingOlder ? (
                    <Spinner />
                  ) : (
                    <ChevronUp className="size-3.5" />
                  )}
                  {t("chat.loadOlder")}
                </Button>
              </div>
            ) : null}
            {chat.messages.map((msg) => (
              <MessageBubble
                key={msg.clientId ?? msg.id}
                message={msg}
                mine={msg.senderId === meId}
                onRetry={
                  msg.failed && msg.clientId && conversationId
                    ? () => chat.retryMessage(conversationId, msg.clientId!)
                    : undefined
                }
              />
            ))}
          </>
        )}
      </div>
    </ScrollArea>
  );
}

function MessageBubble({
  message: msg,
  mine,
  onRetry,
}: {
  message: UiMessage;
  mine: boolean;
  onRetry?: () => void;
}) {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[70%] rounded-2xl px-3.5 py-2.5 shadow-sm",
          mine
            ? "rounded-ee-sm bg-primary text-primary-foreground"
            : "rounded-es-sm border border-border bg-card text-card-foreground",
          msg.failed && "opacity-70",
        )}
      >
        {/* Soft-deleted: the participant view loses the text, the platform
            record keeps it (retention). */}
        <div
          className={cn(
            "break-words whitespace-pre-wrap",
            msg.deleted && "italic opacity-60",
          )}
        >
          {msg.deleted ? t("chat.removedMessage") : msg.body}
        </div>
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">
          <span>
            {formatDate(msg.createdAt, { hour: "2-digit", minute: "2-digit" })}
          </span>
          {mine ? <DeliveryTicks message={msg} /> : null}
        </div>
        {msg.failed ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 flex items-center gap-1 text-[11px] font-medium underline underline-offset-2"
          >
            <AlertCircle className="size-3" />
            {t("chat.sendFailed")} — {t("chat.retry")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function DeliveryTicks({ message: msg }: { message: UiMessage }) {
  if (msg.failed) return <AlertCircle className="size-3" />;
  if (msg.pending) return <Clock3 className="size-3" />;
  if (msg.status === "read")
    return <CheckCheck className="size-3.5 text-sky-300 dark:text-sky-300" />;
  if (msg.status === "delivered") return <CheckCheck className="size-3.5" />;
  return <Check className="size-3.5" />;
}

// ---------------------------------------------------------------------------
// Composer — typing indicator emission is throttled (start once, stop after
// 2.5s idle), Enter sends.
// ---------------------------------------------------------------------------
function Composer({ chat }: { chat: ChatController }) {
  const t = useTranslations();
  const [draft, setDraft] = useState("");
  const typingSent = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationId = chat.activeId;

  useEffect(() => {
    setDraft("");
    typingSent.current = false;
  }, [conversationId]);

  const stopTyping = useCallback(() => {
    if (typingSent.current && conversationId) {
      chat.sendTyping(conversationId, false);
      typingSent.current = false;
    }
  }, [chat, conversationId]);

  useEffect(() => {
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  const onChange = (value: string) => {
    setDraft(value);
    if (!conversationId) return;
    if (!typingSent.current && value.trim()) {
      chat.sendTyping(conversationId, true);
      typingSent.current = true;
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stopTyping, 2500);
  };

  const handleSend = () => {
    if (!conversationId || !draft.trim()) return;
    chat.sendMessage(conversationId, draft);
    setDraft("");
    stopTyping();
  };

  return (
    <div className="border-t border-border bg-card p-4">
      {chat.sendBlock ? (
        <p
          className={cn(
            "mb-2 rounded-md px-3 py-2 text-xs",
            chat.sendBlock === "rate_limited"
              ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {chat.sendBlock === "rate_limited"
            ? t("chat.rateLimited")
            : t("chat.blockedNotice")}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Input
          placeholder={t("chat.inputPlaceholder")}
          value={draft}
          maxLength={4000}
          onChange={(e) => onChange(e.target.value)}
          onBlur={stopTyping}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          className="h-10 rounded-full"
        />
        <Button
          type="button"
          size="icon"
          className="size-10 shrink-0 rounded-full"
          onClick={handleSend}
          disabled={!draft.trim()}
          aria-label={t("chat.send")}
        >
          <Send className="size-4 rtl:-scale-x-100" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New conversation — contact directory (server-computed from the conversation
// matrix + real relationships), searchable, grouped; escalation contacts are
// visually separated so assistant-first communication stays the norm.
// ---------------------------------------------------------------------------
// Display order only — authorization is entirely server-side. Assistants stay
// first for students/parents so "ask the assistant" remains the visual default
// even though the teacher is now directly reachable.
const GROUP_ORDER: WireContact["group"][] = [
  "assistants",
  "team",
  "teachers",
  "centers",
  "staff",
  "students",
  "parents",
  "platform",
];

/** Role chips for the directory. Only roles the server returns can ever show. */
const ROLE_FILTERS = [
  "teacher",
  "assistant",
  "student",
  "parent",
  "center_admin",
  "center_staff",
] as const;

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

function NewConversationDialog({ chat }: { chat: ChatController }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<WireContact[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `chat` is a fresh object on every render of the screen, so a `[chat]`
  // dependency here made `load` — and the reset effect below — re-run on every
  // presence tick, typing indicator and incoming message, wiping whatever the
  // user had typed and re-showing the unfiltered list. Reading the (stable)
  // searchContacts through a ref keeps `load` identity-stable, so the reset
  // fires only when the dialog actually opens.
  const searchContacts = chat.searchContacts;
  const searchRef = useRef(searchContacts);
  useEffect(() => {
    searchRef.current = searchContacts;
  }, [searchContacts]);
  /** Guards against a slow earlier query overwriting a newer one's results. */
  const requestId = useRef(0);

  const load = useCallback(async (term: string) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await searchRef.current(term);
      if (requestId.current !== id) return; // superseded by a later keystroke
      setContacts(result);
    } catch {
      if (requestId.current === id) setContacts([]);
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setRoleFilter(null);
    void load("");
  }, [open, load]);

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
    },
    [],
  );

  const onSearch = (value: string) => {
    setSearch(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void load(value), 300);
  };

  const start = async (contact: WireContact) => {
    setStarting(contact.id);
    try {
      await chat.startConversation(contact.id);
      setOpen(false);
    } catch {
      // Denied by policy/relationship on the server — nothing to do client
      // side; the directory should not have offered it.
    } finally {
      setStarting(null);
    }
  };

  // Client-side role narrowing on top of the server's already-scoped result.
  // This can only ever REMOVE rows — it never widens reach, because the list it
  // filters is exactly the set the server would let this actor message.
  const visible = (contacts ?? []).filter(
    (c) => !roleFilter || c.role === roleFilter,
  );
  const availableRoles = ROLE_FILTERS.filter((r) =>
    (contacts ?? []).some((c) => c.role === r),
  );
  const groups = GROUP_ORDER.map((g) => ({
    group: g,
    items: visible.filter((c) => c.group === g),
  })).filter((g) => g.items.length > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="gap-1">
          <Plus className="size-4" />
          {t("chat.newConversation")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("chat.newConversation")}</DialogTitle>
        </DialogHeader>
        <SearchInput
            placeholder={t("chat.searchContacts")}
            value={search}
            onValueChange={(v) => onSearch(v)}
          />
        {availableRoles.length > 1 ? (
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={t("chat.filterByRole")}
          >
            <FilterChip
              active={roleFilter === null}
              onClick={() => setRoleFilter(null)}
              label={t("chat.filterAll")}
            />
            {availableRoles.map((r) => (
              <FilterChip
                key={r}
                active={roleFilter === r}
                onClick={() => setRoleFilter(r)}
                label={t(`roles.${r}`)}
              />
            ))}
          </div>
        ) : null}
        <ScrollArea className="max-h-80">
          {loading && !contacts ? (
            <div className="flex justify-center p-5">
              <Spinner />
            </div>
          ) : groups.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              {t("chat.noContacts")}
            </p>
          ) : (
            <div className="flex flex-col gap-3 pe-2">
              {groups.map(({ group, items }) => (
                <div key={group}>
                  <p className="px-1 pb-1 text-xs font-semibold text-muted-foreground uppercase">
                    {t(`chat.groups.${group}`)}
                  </p>
                  <ul className="flex flex-col">
                    {items.map((contact) => (
                      <li key={contact.id}>
                        <button
                          type="button"
                          disabled={starting === contact.id}
                          onClick={() => void start(contact)}
                          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-start transition-colors hover:bg-muted/60 disabled:opacity-60"
                        >
                          <Avatar className="size-8">
                            <AvatarFallback>
                              <User className="size-3.5" />
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {contact.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {t(`roles.${contact.role}`)}
                              {contact.subtitle ? ` · ${contact.subtitle}` : ""}
                            </span>
                          </span>
                          {contact.mode === "escalation" ? (
                            <Badge
                              variant="outline"
                              className="shrink-0 text-[10px]"
                            >
                              {t("chat.escalation")}
                            </Badge>
                          ) : null}
                          {starting === contact.id ? <Spinner /> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
