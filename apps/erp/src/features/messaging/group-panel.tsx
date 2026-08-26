"use client";

import { EmptyState } from "@/components/kit/empty-state";
import { Spinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { ScrollArea } from "@repo/ui/components/scroll-area";
import { cn } from "@repo/ui/lib/utils";
import { Bell, BellOff, Megaphone, Send, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { GroupsController } from "./use-groups";

export function GroupPanel({
  groups: ctl,
  meId,
}: {
  groups: GroupsController;
  meId: string;
}) {
  return (
    <>
      <GroupList ctl={ctl} />
      <GroupThread ctl={ctl} meId={meId} />
    </>
  );
}

function GroupList({ ctl }: { ctl: GroupsController }) {
  const t = useTranslations();
  const { formatDate } = useFormatters();

  return (
    <div className="flex h-full min-h-0 flex-col border-b border-rule md:border-b-0 md:border-e">
      <div className="flex items-center justify-between border-b border-rule p-4">
        <span className="font-bold text-ink">
          {t("chat.channels.title")}
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {ctl.loading ? (
          <div className="flex justify-center p-5">
            <Spinner />
          </div>
        ) : ctl.error === "load_failed" && ctl.groups.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Megaphone}
              tone="error"
              title={t("chat.loadFailed")}
              description={t("chat.loadFailedHint")}
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void ctl.refresh()}
                >
                  {t("chat.retry")}
                </Button>
              }
            />
          </div>
        ) : ctl.groups.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Megaphone}
              title={t("chat.channels.empty")}
              description={t("chat.channels.emptyHint")}
            />
          </div>
        ) : (
          <ul>
            {ctl.groups.map((g) => (
              <li
                key={g.id}
                onClick={() => void ctl.open(g.id)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 border-b border-rule px-4 py-3 transition-colors",
                  ctl.activeId === g.id ? "bg-indigo-soft" : "hover:bg-rule-2",
                )}
              >
                <div className="relative shrink-0 rounded-full bg-field p-2">
                  <Megaphone className="size-4 text-ink-2" />
                  {g.unreadCount > 0 ? (
                    <span className="absolute -top-1 -inset-e-1 flex min-w-4 items-center justify-center rounded-md bg-destructive px-1 text-[10px] leading-4 font-medium text-destructive-foreground">
                      {g.unreadCount}
                    </span>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium text-ink">
                      {g.title}
                    </p>
                    <span className="shrink-0 text-xs text-ink-2">
                      {formatDate(g.lastMessageAt, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-ink-2">
                    <span className="shrink-0 rounded-md bg-field px-1.5 py-px text-[10px]">
                      {t(`chat.channels.kinds.${g.kind}`)}
                    </span>
                    {g.muted ? (
                      <BellOff className="size-3 shrink-0" />
                    ) : null}
                    <span className="truncate">
                      {g.lastMessagePreview || t("chat.noPreview")}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

function GroupThread({
  ctl,
  meId,
}: {
  ctl: GroupsController;
  meId: string;
}) {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const [draft, setDraft] = useState("");
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const v = viewportRef.current;
    if (v) v.scrollTop = v.scrollHeight;
  }, [ctl.thread]);

  useEffect(() => {
    setDraft("");
  }, [ctl.activeId]);

  if (!ctl.activeId || !ctl.thread) {
    return (
      <div className="hidden h-full items-center justify-center p-6 md:col-span-2 md:flex">
        <EmptyState
          icon={Megaphone}
          title={t("chat.selectConversation")}
          description={t("chat.channels.emptyHint")}
        />
      </div>
    );
  }

  const { group, messages } = ctl.thread;
  const active = ctl.groups.find((g) => g.id === ctl.activeId);

  const send = () => {
    if (!draft.trim()) return;
    void ctl.post(group.id, draft);
    setDraft("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col md:col-span-2">
      <div className="flex items-center gap-3 border-b border-rule p-4">
        <div className="shrink-0 rounded-full bg-field p-2">
          <Megaphone className="size-4 text-ink-2" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <strong className="truncate text-ink">{group.title}</strong>
            <Badge variant="secondary" className="text-[10px]">
              {t(`chat.channels.kinds.${group.kind}`)}
            </Badge>
          </div>
          <p className="flex items-center gap-1 text-xs text-ink-2">
            <Users className="size-3" />
            {t("chat.channels.members", { count: group.memberCount })}
            <span className="opacity-70">
              · {t("chat.channels.membersDerived")}
            </span>
          </p>
        </div>
        {active ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={
              active.muted ? t("chat.channels.unmute") : t("chat.channels.mute")
            }
            onClick={() => void ctl.setMuted(group.id, !active.muted)}
          >
            {active.muted ? (
              <BellOff className="size-4" />
            ) : (
              <Bell className="size-4" />
            )}
          </Button>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1 bg-rule-2" viewportRef={viewportRef}>
        <div className="flex w-full flex-col gap-3 p-4">
          {ctl.threadLoading && messages.length === 0 ? (
            <div className="flex justify-center p-5">
              <Spinner />
            </div>
          ) : (
            messages.map((m) => {
              const mine = m.senderId === meId;
              return (
                <div
                  key={m.id}
                  className={cn("flex", mine ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[70%] rounded-2xl px-3.5 py-2.5 ",
                      mine
                        ? "rounded-ee-sm bg-indigo text-indigo-ink"
                        : "rounded-es-sm border border-rule bg-sheet text-ink",
                    )}
                  >
                    <div
                      className={cn(
                        "wrap-break-word whitespace-pre-wrap",
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
            })
          )}
        </div>
      </ScrollArea>
      {ctl.error === "rate_limited" ? (
        <div className="border-t border-rule bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
          {t("chat.rateLimited")}
        </div>
      ) : null}
      {group.canPost ? (
        <div className="border-t border-rule bg-sheet p-4">
          <div className="flex items-center gap-2">
            <Input
              placeholder={t("chat.inputPlaceholder")}
              value={draft}
              maxLength={4000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              className="h-10 rounded-full"
            />
            <Button
              type="button"
              size="icon"
              className="size-10 shrink-0 rounded-full"
              onClick={send}
              disabled={!draft.trim()}
              aria-label={t("chat.send")}
            >
              <Send className="size-4 rtl:-scale-x-100" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-t border-rule bg-rule-2 p-4 text-center text-xs text-ink-2">
          {t("chat.channels.readOnly")}
        </div>
      )}
    </div>
  );
}
