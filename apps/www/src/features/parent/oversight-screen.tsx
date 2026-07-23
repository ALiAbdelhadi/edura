"use client";

// Parent oversight — read-only view of a MINOR child's conversations with
// adults (teachers, assistants, center admins/staff).
//
// The UI states the boundaries plainly rather than hiding them: it says the
// view is read-only, that opening a thread marks nothing as read for the child,
// and that the child knows the parent can see these. A monitoring feature that
// explains itself to everyone involved is a safeguard; one that doesn't is
// surveillance.
import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Eye,
  MessageSquare,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@repo/ui/components/card";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { ScrollArea } from "@repo/ui/components/scroll-area";
import { cn } from "@repo/ui/lib/utils";
import { api } from "@/lib/api/client";
import { EmptyState } from "@/components/kit/empty-state";
import { Spinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";
import type { Envelope } from "@/features/messaging/chat-types";

type Child = {
  studentId: string;
  name: string | null;
  isMinor: boolean;
  conversationCount: number;
};

/** The adult roles a monitored thread can involve (server-enforced). */
type AdultRole = "teacher" | "assistant" | "center_admin" | "center_staff";

type OversightConversation = {
  id: string;
  partner: { id: string; name: string | null; role: AdultRole | null };
  lastMessageAt: string;
  lastMessagePreview: string | null;
  messageCount: number;
  createdAt: string;
};

type ThreadMessage = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  deleted: boolean;
};

export function OversightScreen() {
  const t = useTranslations();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [child, setChild] = useState<Child | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api
          .get("parent/oversight/children")
          .json<Envelope<Child[]>>();
        setChildren(res.data);
      } catch {
        setChildren([]);
      }
    })();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-sky-500/30 bg-sky-500/5 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-sky-600 dark:text-sky-400" />
          <div>
            <h2 className="font-bold text-foreground">{t("oversight.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("oversight.subtitle")}
            </p>
          </div>
        </div>
      </Card>

      {child ? (
        <ChildConversations child={child} onBack={() => setChild(null)} />
      ) : (
        <ChildrenList children={children} onPick={setChild} />
      )}
    </div>
  );
}

function ChildrenList({
  children,
  onPick,
}: {
  children: Child[] | null;
  onPick: (c: Child) => void;
}) {
  const t = useTranslations();

  if (!children) {
    return (
      <Card className="flex min-h-40 items-center justify-center">
        <Spinner />
      </Card>
    );
  }
  if (children.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState icon={Users} title={t("oversight.noChildren")} />
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {children.map((c) => (
        <Card
          key={c.studentId}
          className={cn(
            "p-4 transition-colors",
            c.isMinor ? "cursor-pointer hover:bg-muted/50" : "opacity-75",
          )}
          onClick={() => c.isMinor && onPick(c)}
        >
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback>
                <User className="size-4" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium text-foreground">{c.name}</p>
                {c.isMinor ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {t("oversight.minorBadge")}
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {c.isMinor
                  ? t("oversight.conversationsCount", {
                      count: c.conversationCount,
                    })
                  : /* A verified adult keeps their privacy — the only way out
                       of the default-minor rule. */
                    t("oversight.adultChild")}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function ChildConversations({
  child,
  onBack,
}: {
  child: Child;
  onBack: () => void;
}) {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const [items, setItems] = useState<OversightConversation[] | null>(null);
  const [active, setActive] = useState<OversightConversation | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api
          .get(`parent/oversight/children/${child.studentId}/conversations`)
          .json<Envelope<OversightConversation[]>>();
        setItems(res.data);
      } catch {
        setItems([]);
      }
    })();
  }, [child.studentId]);

  const openThread = useCallback(
    async (c: OversightConversation) => {
      setActive(c);
      setMessages(null);
      try {
        const res = await api
          .get(
            `parent/oversight/children/${child.studentId}/conversations/${c.id}`,
          )
          .json<Envelope<{ messages: ThreadMessage[] }>>();
        setMessages(res.data.messages);
      } catch {
        setMessages([]);
      }
    },
    [child.studentId],
  );

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b border-border p-4">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4 rtl:-scale-x-100" />
          {t("oversight.backToChildren")}
        </Button>
        <span className="font-medium text-foreground">{child.name}</span>
      </div>

      <div className="flex items-center gap-2 border-b border-border bg-sky-500/10 px-4 py-2 text-xs text-sky-800 dark:text-sky-300">
        <Eye className="size-3.5 shrink-0" />
        {t("oversight.readOnlyNotice")}
      </div>

      <div className="grid min-h-[420px] grid-cols-1 md:grid-cols-3">
        <div className="border-b border-border md:border-b-0 md:border-e">
          {!items ? (
            <div className="flex justify-center p-5">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={MessageSquare}
                title={t("oversight.noConversations")}
              />
            </div>
          ) : (
            <ScrollArea className="max-h-[480px]">
              <ul>
                {items.map((c) => (
                  <li
                    key={c.id}
                    onClick={() => void openThread(c)}
                    className={cn(
                      "cursor-pointer border-b border-border px-4 py-3 transition-colors",
                      active?.id === c.id ? "bg-accent" : "hover:bg-muted/50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium text-foreground">
                        {c.partner.name}
                      </p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(c.lastMessageAt, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {c.partner.role ? (
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px]">
                          {t(`roles.${c.partner.role}`)}
                        </span>
                      ) : null}
                      <span className="truncate">
                        {t("oversight.messagesCount", { count: c.messageCount })}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </div>

        <div className="md:col-span-2">
          {!active ? (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                icon={Eye}
                title={t("chat.selectConversation")}
                description={t("oversight.readOnlyNotice")}
              />
            </div>
          ) : !messages ? (
            <div className="flex justify-center p-5">
              <Spinner />
            </div>
          ) : (
            <ScrollArea className="max-h-[480px] bg-muted/40">
              <div className="flex flex-col gap-3 p-4">
                {messages.map((m) => {
                  const fromChild = m.senderId === child.studentId;
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "flex",
                        fromChild ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-sm",
                          fromChild
                            ? "rounded-ee-sm bg-primary/90 text-primary-foreground"
                            : "rounded-es-sm border border-border bg-card text-card-foreground",
                        )}
                      >
                        <div
                          className={cn(
                            "break-words whitespace-pre-wrap",
                            m.deleted && "italic opacity-60",
                          )}
                        >
                          {m.deleted ? t("chat.removedMessage") : m.body}
                        </div>
                        <div className="mt-1 text-end text-[10px] opacity-70">
                          {formatDate(m.createdAt, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
          {/* No composer, deliberately: there is no write path for a parent
              into their child's conversation, in the UI or on the server. */}
        </div>
      </div>
    </Card>
  );
}
