"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Eye, MessageSquare, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api/client";
import { useChildSelector } from "@/components/ui/child-selector";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { useFormatters } from "@/lib/i18n/use-formatters";
import type { Envelope } from "@/features/messaging/chat-types";
import { cn } from "@repo/ui/lib/utils";
import {
  Figure,
  LimitNote,
  LoadError,
  SectionHead,
  SkeletonRows,
} from "./ledger-kit";

type Child = {
  studentId: string;
  name: string | null;
  isMinor: boolean;
  conversationCount: number;
};

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

type Async<T> = { status: "loading" } | { status: "error" } | { status: "ok"; data: T };

const LOADING = { status: "loading" } as const;
const FAILED = { status: "error" } as const;

function DisclosureStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 border-b border-rule bg-sheet px-4 py-2.5">
      <Eye className="mt-px size-3.5 shrink-0 text-ink-3" aria-hidden />
      <p className="text-xs leading-relaxed text-ink-2">{children}</p>
    </div>
  );
}

export function OversightScreen() {
  const t = useTranslations();
  const [children, setChildren] = useState<Async<Child[]>>(LOADING);
  const { childId: contextChildId, setChildId } = useChildSelector();
  const [browsing, setBrowsing] = useState(false);

  const load = useCallback(async () => {
    setChildren(LOADING);
    try {
      const res = await api
        .get("parent/oversight/children")
        .json<Envelope<Child[]>>();
      setChildren({ status: "ok", data: res.data });
    } catch {
      setChildren(FAILED);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setBrowsing(false);
  }, [contextChildId]);

  const monitored =
    children.status === "ok"
      ? (children.data.find((c) => c.studentId === contextChildId && c.isMinor) ??
        null)
      : null;
  const child = browsing ? null : monitored;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={t("roles.parent")}
        title={t("oversight.title")}
        description={t("oversight.subtitle")}
      />

      {child ? (
        <ChildConversations child={child} onBack={() => setBrowsing(true)} />
      ) : (
        <ChildrenList
          state={children}
          onPick={(c) => {
            setChildId(c.studentId);
            setBrowsing(false);
          }}
          onRetry={load}
        />
      )}
    </div>
  );
}

function ChildrenList({
  state,
  onPick,
  onRetry,
}: {
  state: Async<Child[]>;
  onPick: (c: Child) => void;
  onRetry: () => void;
}) {
  const t = useTranslations();

  if (state.status === "loading") return <SkeletonRows rows={2} />;
  if (state.status === "error") {
    return (
      <LoadError
        message={t("parentOversight.childrenFailed")}
        onRetry={onRetry}
        retryLabel={t("parentOversight.retry")}
      />
    );
  }
  if (state.data.length === 0) {
    return (
      <EmptyState icon={Users} title={t("oversight.noChildren")} />
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {state.data.map((c) =>
        c.isMinor ? (
          <li key={c.studentId}>
            <button
              type="button"
              onClick={() => onPick(c)}
              className="flex w-full flex-col items-start gap-1 rounded-xl border border-rule bg-sheet p-4 text-start transition-colors hover:bg-rule-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo"
              style={{ boxShadow: "var(--lift)" }}
            >
              <span className="eyebrow">{t("oversight.minorBadge")}</span>
              <span className="text-[15px] font-semibold text-ink">
                {c.name}
              </span>
              <span className="text-xs text-ink-2">
                {t("oversight.conversationsCount", {
                  count: c.conversationCount,
                })}
              </span>
            </button>
          </li>
        ) : (
          <li
            key={c.studentId}
            className="flex flex-col items-start gap-1 rounded-xl border border-dashed border-rule bg-paper p-4"
          >
            <span className="eyebrow">{t("parentOversight.privateEyebrow")}</span>
            <span className="text-[15px] font-semibold text-ink">{c.name}</span>
            <LimitNote>{t("oversight.adultChild")}</LimitNote>
          </li>
        ),
      )}
    </ul>
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
  const [items, setItems] = useState<Async<OversightConversation[]>>(LOADING);
  const [active, setActive] = useState<OversightConversation | null>(null);
  const [messages, setMessages] = useState<Async<ThreadMessage[]>>(LOADING);

  const loadThreads = useCallback(async () => {
    setItems(LOADING);
    try {
      const res = await api
        .get(`parent/oversight/children/${child.studentId}/conversations`)
        .json<Envelope<OversightConversation[]>>();
      setItems({ status: "ok", data: res.data });
    } catch {
      setItems(FAILED);
    }
  }, [child.studentId]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const openThread = useCallback(
    async (c: OversightConversation) => {
      setActive(c);
      setMessages(LOADING);
      try {
        const res = await api
          .get(
            `parent/oversight/children/${child.studentId}/conversations/${c.id}`,
          )
          .json<Envelope<{ messages: ThreadMessage[] }>>();
        setMessages({ status: "ok", data: res.data.messages });
      } catch {
        setMessages(FAILED);
      }
    },
    [child.studentId],
  );

  return (
    <div
      className="overflow-hidden rounded-xl border border-rule bg-sheet"
      style={{ boxShadow: "var(--lift)" }}
    >
      <div className="flex items-center gap-3 border-b border-rule px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo"
        >
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
          {t("oversight.backToChildren")}
        </button>
        <span className="text-[15px] font-semibold text-ink">{child.name}</span>
      </div>

      <DisclosureStrip>{t("oversight.readOnlyNotice")}</DisclosureStrip>

      <div className="grid min-h-[420px] grid-cols-1 md:grid-cols-3">
        <div className="border-b border-rule md:border-b-0 md:border-e">
          {items.status === "loading" ? (
            <SkeletonRows rows={4} className="p-4" />
          ) : items.status === "error" ? (
            <div className="p-4">
              <LoadError
                message={t("parentOversight.threadsFailed")}
                onRetry={loadThreads}
                retryLabel={t("parentOversight.retry")}
              />
            </div>
          ) : items.data.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={MessageSquare}
                title={t("oversight.noConversations")}
              />
            </div>
          ) : (
            <ul className="max-h-[480px] overflow-y-auto">
              {items.data.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => void openThread(c)}
                    className={cn(
                      "flex w-full flex-col gap-1 border-b border-rule-2 px-4 py-3 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo",
                      active?.id === c.id ? "bg-indigo-soft" : "hover:bg-rule-2",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-semibold text-ink">
                        {c.partner.name}
                      </span>
                      <Figure className="shrink-0 text-[11px] text-ink-3">
                        {formatDate(c.lastMessageAt, {
                          month: "short",
                          day: "numeric",
                        })}
                      </Figure>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.partner.role ? (
                        <span className="rounded-md bg-indigo-soft px-1.5 py-px text-[10px] font-medium text-indigo">
                          {t(`roles.${c.partner.role}`)}
                        </span>
                      ) : null}
                      <span className="truncate text-[11px] text-ink-3">
                        {t("oversight.messagesCount", {
                          count: c.messageCount,
                        })}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
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
          ) : messages.status === "loading" ? (
            <SkeletonRows rows={5} className="p-4" />
          ) : messages.status === "error" ? (
            <div className="p-4">
              <LoadError
                message={t("parentOversight.messagesFailed")}
                onRetry={() => void openThread(active)}
                retryLabel={t("parentOversight.retry")}
              />
            </div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto bg-paper">
              <div className="flex flex-col gap-3 p-4">
                {messages.data.map((m) => {
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
                          "max-w-[75%] rounded-xl border px-3.5 py-2.5",
                          fromChild
                            ? "border-indigo-soft bg-indigo-soft"
                            : "border-rule bg-sheet",
                        )}
                      >
                        <div
                          className={cn(
                            "text-[13px] leading-relaxed break-words whitespace-pre-wrap",
                            m.deleted ? "text-ink-3 italic" : "text-ink",
                          )}
                        >
                          {m.deleted ? t("chat.removedMessage") : m.body}
                        </div>
                        <Figure className="mt-1 block text-end text-[10px] text-ink-3">
                          {formatDate(m.createdAt, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Figure>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
