"use client";

import React, { useState, useEffect, useRef } from "react";
import { useList, useCustomMutation, useCustom } from "@refinedev/core";
import { Send, User, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Button } from "@repo/ui/components/button";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { cn } from "@repo/ui/lib/utils";
import { EmptyState } from "@/components/kit/empty-state";
import { Spinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";

export function MessagesScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [readThreadIds, setReadThreadIds] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { query: threadsQuery, result: threadsResult } = useList({
    resource: "messages/threads",
    pagination: { mode: "off" },
    queryOptions: {
      refetchInterval: 10000,
    }
  });

  const threads = (threadsResult?.data ?? []) as any[];

  const { query: messagesQuery, result: messagesResult } = useCustom({
    url: selectedThreadId ? `messages/threads/${selectedThreadId}` : "",
    method: "get",
    queryOptions: {
      enabled: !!selectedThreadId,
      refetchInterval: 5000,
    }
  });

  const messages = (messagesResult?.data ?? []) as any[];

  const { mutateAsync: sendMessage, mutation } = useCustomMutation();

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedThreadId) return;
    try {
      await sendMessage({
        url: "messages",
        method: "post",
        values: {
          threadId: selectedThreadId,
          body: newMessage.trim(),
        },
      });
      setNewMessage("");
      messagesQuery.refetch();
      threadsQuery.refetch();
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="grid min-h-[600px] grid-cols-1 md:grid-cols-3 h-[calc(100vh-200px)]">
        {/* Threads list */}
        <div className="flex h-full flex-col border-b border-border md:border-b-0 md:border-e">
          <div className="border-b border-border p-4 font-bold text-foreground">
            {t("nav.messages")}
          </div>
          <div className="flex-1 overflow-y-auto">
            {threadsQuery.isLoading ? (
              <div className="flex justify-center p-5">
                <Spinner />
              </div>
            ) : threads.length === 0 ? (
              <div className="p-6">
                <EmptyState icon={MessageSquare} title={t("shared.msgEmpty")} />
              </div>
            ) : (
              <ul>
                {threads.map((thread) => {
                  const isSelected = selectedThreadId === thread.id;
                  const unread = readThreadIds.has(thread.id) ? 0 : thread.unreadCount;
                  return (
                    <li
                      key={thread.id}
                      onClick={() => {
                        setSelectedThreadId(thread.id);
                        if (thread.unreadCount > 0) {
                          setReadThreadIds((prev) => new Set(prev).add(thread.id));
                        }
                      }}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 border-b border-border px-4 py-3 transition-colors",
                        isSelected ? "bg-accent" : "hover:bg-muted/50",
                      )}
                    >
                      <div className="relative shrink-0">
                        <Avatar>
                          <AvatarFallback>
                            <User className="size-4" />
                          </AvatarFallback>
                        </Avatar>
                        {unread > 0 ? (
                          <span className="absolute -top-1 -end-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-medium text-destructive-foreground">
                            {unread}
                          </span>
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">
                          {thread.otherParticipant?.name || t("shared.msgUnknownUser")}
                        </p>
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span
                            className={cn(
                              "truncate",
                              unread > 0
                                ? "font-bold text-foreground"
                                : "text-muted-foreground",
                            )}
                          >
                            {thread.lastMessageBody || t("shared.msgNoPreview")}
                          </span>
                          <span className="shrink-0">
                            {formatDate(thread.lastMessageAt, { month: "short", day: "numeric" })}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Conversation */}
        <div className="flex h-full flex-col md:col-span-2">
          {selectedThreadId ? (
            <>
              <div className="flex items-center border-b border-border p-4">
                <Avatar className="me-3">
                  <AvatarFallback>
                    <User className="size-4" />
                  </AvatarFallback>
                </Avatar>
                <strong className="text-foreground">
                  {threads.find((t) => t.id === selectedThreadId)?.otherParticipant?.name}
                </strong>
              </div>

              <div className="flex-1 overflow-y-auto bg-muted/40 p-4">
                {messagesQuery.isLoading ? (
                  <div className="flex justify-center p-5">
                    <Spinner />
                  </div>
                ) : (
                  <div className="flex w-full flex-col gap-4">
                    {messages.map((msg) => {
                      const isMe = !!msg.mine;

                      return (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex",
                            isMe ? "justify-end" : "justify-start",
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[70%] rounded-2xl px-3.5 py-2.5 shadow-sm",
                              isMe
                                ? "rounded-ee-sm bg-primary text-primary-foreground"
                                : "rounded-es-sm bg-card text-card-foreground border border-border",
                            )}
                          >
                            <div className="break-words">{msg.body}</div>
                            <div className="mt-1 text-end text-[10px] opacity-70">
                              {formatDate(msg.createdAt, { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <div className="border-t border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder={t("shared.msgInputPlaceholder")}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
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
                    disabled={!newMessage.trim() || mutation.isPending}
                  >
                    {mutation.isPending ? (
                      <Spinner />
                    ) : (
                      <Send className="size-4 rtl:-scale-x-100" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-muted/40 text-center text-muted-foreground">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MessageSquare className="size-6" />
              </div>
              <p className="text-sm">{t("shared.msgSelectThread")}</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
