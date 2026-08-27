"use client";

import { api } from "@/lib/api/client";
import type {
  ConversationReadEvent,
  MessageDeliveredEvent,
  MessageNewEvent,
  PresenceStateEvent,
  PresenceUpdateEvent,
  SendMessageAck,
  TypingEvent,
} from "@repo/database/chat-protocol";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ChatConnectionStatus,
  Envelope,
  UiMessage,
  WireContact,
  WireConversation,
  WireMessage,
} from "./chat-types";

const PAGE_SIZE = 50;

const TERMINAL_SEND_CODES = new Set([
  "rate_limited",
  "blocked",
  "policy_denied",
  "no_relationship",
  "not_participant",
  "invalid_body",
]);

export type OversightNotice = {
  monitored: boolean;
  minorParticipantId: string | null;
};

function resolveRealtimeUrl(configured: string): string {
  if (typeof window === "undefined") return configured;
  const loopback = (h: string) =>
    h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
  try {
    const target = new URL(configured, window.location.origin);
    if (loopback(target.hostname) && !loopback(window.location.hostname)) {
      target.hostname = window.location.hostname;
    }
    return target.origin;
  } catch {
    return configured;
  }
}

function sortConversations(list: WireConversation[]): WireConversation[] {
  return [...list].sort(
    (a, b) =>
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );
}

function insertMessage(list: UiMessage[], msg: UiMessage): UiMessage[] {
  const withoutDupes = list.filter(
    (m) =>
      m.id !== msg.id && !(msg.clientId && m.clientId === msg.clientId),
  );
  const next = [...withoutDupes, msg];
  next.sort((a, b) => {
    if (a.pending && b.pending)
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (a.pending) return 1;
    if (b.pending) return -1;
    return a.seq - b.seq;
  });
  return next;
}

export function useChat(meId: string) {
  const [status, setStatus] = useState<ChatConnectionStatus>("connecting");
  const [conversations, setConversations] = useState<WireConversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);

  const [conversationsError, setConversationsError] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, UiMessage[]>>({});
  const [hasOlder, setHasOlder] = useState<Record<string, boolean>>({});
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState(false);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [typingIn, setTypingIn] = useState<Record<string, boolean>>({});
  const [oversight, setOversight] = useState<OversightNotice | null>(null);
  const [sendBlock, setSendBlock] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  useLayoutEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await api
        .get("messages/conversations")
        .json<Envelope<WireConversation[]>>();
      setConversations(sortConversations(res.data));
      setConversationsError(false);
    } catch {
      setConversationsError(true);
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  const loadThread = useCallback(async (conversationId: string) => {
    setThreadLoading(true);
    setThreadError(false);
    try {
      const res = await api
        .get(`messages/conversations/${conversationId}`, {
          searchParams: { limit: PAGE_SIZE },
        })
        .json<
          Envelope<{
            conversation: WireConversation;
            messages: WireMessage[];
            hasMore: boolean;
            oversight: OversightNotice;
          }>
        >();
      setOversight(res.data.oversight ?? null);
      setMessages((prev) => {
        const pending = (prev[conversationId] ?? []).filter((m) => m.pending);
        return {
          ...prev,
          [conversationId]: [...res.data.messages, ...pending],
        };
      });
      setHasOlder((prev) => ({
        ...prev,
        [conversationId]: res.data.hasMore,
      }));
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === conversationId);
        const next = exists
          ? prev.map((c) =>
              c.id === conversationId ? res.data.conversation : c,
            )
          : [...prev, res.data.conversation];
        return sortConversations(next);
      });
    } catch {
      setThreadError(true);
    } finally {
      setThreadLoading(false);
    }
  }, []);

  const loadOlder = useCallback(
    async (conversationId: string) => {
      const current = messages[conversationId] ?? [];
      const oldest = current.find((m) => !m.pending);
      if (!oldest) return;
      const res = await api
        .get(`messages/conversations/${conversationId}`, {
          searchParams: { limit: PAGE_SIZE, beforeSeq: oldest.seq },
        })
        .json<Envelope<{ messages: WireMessage[]; hasMore: boolean }>>();
      setMessages((prev) => ({
        ...prev,
        [conversationId]: [
          ...res.data.messages,
          ...(prev[conversationId] ?? []),
        ],
      }));
      setHasOlder((prev) => ({ ...prev, [conversationId]: res.data.hasMore }));
    },
    [messages],
  );

  const markRead = useCallback((conversationId: string) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c,
      ),
    );
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit("conversation:read", { conversationId });
    } else {
      void api
        .post(`messages/conversations/${conversationId}/read`)
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let socket: Socket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;
    let detachWake = () => {};

    const fetchToken = () =>
      api
        .get("realtime/token")
        .json<Envelope<{ token: string; url: string }>>();

    const scheduleManualReconnect = () => {
      if (disposed || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (disposed || !socket || socket.connected || socket.active) return;
        retryDelay = Math.min(retryDelay * 2, 10_000);
        socket.connect();
      }, retryDelay);
    };

    const wake = () => {
      if (disposed || !socket || socket.connected) return;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      retryDelay = 1000;
      socket.connect();
    };

    void (async () => {
      let url = resolveRealtimeUrl(
        process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:3005",
      );
      try {
        const first = await fetchToken();
        if (first.data.url) url = resolveRealtimeUrl(first.data.url);
      } catch {
      }
      if (disposed) return;

      socket = io(url, {
        transports: ["websocket"],
        reconnectionDelayMax: 10_000,
        auth: (cb) => {
          fetchToken()
            .then((res) => cb({ token: res.data.token }))
            .catch(() => cb({}));
        },
      });
      socketRef.current = socket;

      const onVisible = () => {
        if (document.visibilityState === "visible") wake();
      };
      window.addEventListener("online", wake);
      document.addEventListener("visibilitychange", onVisible);
      detachWake = () => {
        window.removeEventListener("online", wake);
        document.removeEventListener("visibilitychange", onVisible);
      };

      socket.on("connect", () => {
        retryDelay = 1000;
        setStatus("online");
        void refreshConversations();
        const active = activeIdRef.current;
        if (active) void loadThread(active);
      });
      socket.on("disconnect", () => setStatus("offline"));
      socket.on("connect_error", () => {
        setStatus("offline");
        if (socket && !socket.active) scheduleManualReconnect();
      });

      socket.on("message:new", (ev: MessageNewEvent) => {
        const msg = ev.message as unknown as WireMessage;
        const mine = msg.senderId === meId;
        const isActive = activeIdRef.current === msg.conversationId;

        setMessages((prev) => {
          if (!(msg.conversationId in prev)) return prev;
          return {
            ...prev,
            [msg.conversationId]: insertMessage(
              prev[msg.conversationId] ?? [],
              msg,
            ),
          };
        });
        setConversations((prev) => {
          const existing = prev.find((c) => c.id === msg.conversationId);
          if (!existing) {
            void refreshConversations();
            return prev;
          }
          return sortConversations(
            prev.map((c) =>
              c.id === msg.conversationId
                ? {
                    ...c,
                    lastMessageAt: msg.createdAt,
                    lastMessagePreview: msg.body.slice(0, 140),
                    lastMessageSenderId: msg.senderId,
                    unreadCount:
                      !mine && !isActive ? c.unreadCount + 1 : c.unreadCount,
                  }
                : c,
            ),
          );
        });
        setTypingIn((prev) =>
          prev[msg.conversationId]
            ? { ...prev, [msg.conversationId]: false }
            : prev,
        );
        if (!mine && isActive) markRead(msg.conversationId);
      });

      socket.on("message:delivered", (ev: MessageDeliveredEvent) => {
        setMessages((prev) => {
          const list = prev[ev.conversationId];
          if (!list) return prev;
          return {
            ...prev,
            [ev.conversationId]: list.map((m) =>
              m.senderId === meId && m.seq <= ev.upToSeq && m.status === "sent"
                ? { ...m, status: "delivered", deliveredAt: ev.deliveredAt }
                : m,
            ),
          };
        });
      });

      socket.on("conversation:read", (ev: ConversationReadEvent) => {
        if (ev.readerId === meId) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === ev.conversationId ? { ...c, unreadCount: 0 } : c,
            ),
          );
          return;
        }
        setMessages((prev) => {
          const list = prev[ev.conversationId];
          if (!list) return prev;
          return {
            ...prev,
            [ev.conversationId]: list.map((m) =>
              m.senderId === meId && m.status !== "read"
                ? { ...m, status: "read", readAt: ev.readAt }
                : m,
            ),
          };
        });
        setConversations((prev) =>
          prev.map((c) =>
            c.id === ev.conversationId
              ? { ...c, partnerLastReadAt: ev.readAt }
              : c,
          ),
        );
      });

      socket.on("typing", (ev: TypingEvent) => {
        if (ev.userId === meId) return;
        setTypingIn((prev) => ({ ...prev, [ev.conversationId]: ev.typing }));
        const existing = typingTimers.current.get(ev.conversationId);
        if (existing) clearTimeout(existing);
        if (ev.typing) {
          typingTimers.current.set(
            ev.conversationId,
            setTimeout(() => {
              setTypingIn((prev) => ({ ...prev, [ev.conversationId]: false }));
            }, 4000),
          );
        }
      });

      socket.on("presence:state", (ev: PresenceStateEvent) => {
        setOnlineIds(new Set(ev.online));
      });
      socket.on("presence:update", (ev: PresenceUpdateEvent) => {
        setOnlineIds((prev) => {
          const next = new Set(prev);
          if (ev.online) next.add(ev.userId);
          else next.delete(ev.userId);
          return next;
        });
      });
    })();

    void refreshConversations();

    const timers = typingTimers.current;
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      detachWake();
      socket?.disconnect();
      socketRef.current = null;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, [meId, refreshConversations, loadThread, markRead]);

  const openConversation = useCallback(
    (conversationId: string) => {
      setActiveId(conversationId);
      void loadThread(conversationId);
      markRead(conversationId);
    },
    [loadThread, markRead],
  );

  const sendMessage = useCallback(
    (conversationId: string, body: string, existingClientId?: string) => {
      const text = body.trim();
      if (!text) return;
      const clientId = existingClientId ?? crypto.randomUUID();
      const optimistic: UiMessage = {
        id: clientId,
        conversationId,
        senderId: meId,
        seq: Number.MAX_SAFE_INTEGER,
        body: text,
        clientId,
        status: "sent",
        deliveredAt: null,
        readAt: null,
        createdAt: new Date().toISOString(),
        deleted: false,
        pending: true,
      };
      setMessages((prev) => ({
        ...prev,
        [conversationId]: insertMessage(prev[conversationId] ?? [], optimistic),
      }));
      setConversations((prev) =>
        sortConversations(
          prev.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  lastMessageAt: optimistic.createdAt,
                  lastMessagePreview: text.slice(0, 140),
                  lastMessageSenderId: meId,
                }
              : c,
          ),
        ),
      );

      const finalize = (message: WireMessage) => {
        setMessages((prev) => ({
          ...prev,
          [conversationId]: insertMessage(prev[conversationId] ?? [], {
            ...message,
            pending: false,
          }),
        }));
      };
      const markFailed = () => {
        setMessages((prev) => ({
          ...prev,
          [conversationId]: (prev[conversationId] ?? []).map((m) =>
            m.clientId === clientId ? { ...m, failed: true } : m,
          ),
        }));
      };
      const sendViaRest = async () => {
        try {
          const res = await api
            .post("messages", { json: { conversationId, body: text, clientId } })
            .json<Envelope<WireMessage>>();
          setSendBlock(null);
          finalize(res.data);
        } catch (e) {
          const status = (e as { response?: { status?: number } })?.response
            ?.status;
          if (status === 429) setSendBlock("rate_limited");
          else if (status === 403) setSendBlock("blocked");
          markFailed();
        }
      };

      const socket = socketRef.current;
      if (socket?.connected) {
        socket
          .timeout(8000)
          .emit(
            "message:send",
            { conversationId, body: text, clientId },
            (err: Error | null, ack: SendMessageAck) => {
              if (!err && ack?.ok) {
                setSendBlock(null);
                finalize(ack.message as unknown as WireMessage);
                return;
              }
              const code = !err && ack && !ack.ok ? ack.code : undefined;
              if (code && TERMINAL_SEND_CODES.has(code)) {
                if (code === "rate_limited" || code === "blocked") {
                  setSendBlock(code);
                }
                markFailed();
                return;
              }
              void sendViaRest();
            },
          );
      } else {
        void sendViaRest();
      }
    },
    [meId],
  );

  const retryMessage = useCallback(
    (conversationId: string, clientId: string) => {
      const msg = (messages[conversationId] ?? []).find(
        (m) => m.clientId === clientId,
      );
      if (!msg) return;
      setMessages((prev) => ({
        ...prev,
        [conversationId]: (prev[conversationId] ?? []).map((m) =>
          m.clientId === clientId ? { ...m, failed: false } : m,
        ),
      }));
      sendMessage(conversationId, msg.body, clientId);
    },
    [messages, sendMessage],
  );

  const startConversation = useCallback(
    async (recipientId: string): Promise<string> => {
      const res = await api
        .post("messages/conversations", { json: { recipientId } })
        .json<Envelope<WireConversation>>();
      const conversation = res.data;
      setConversations((prev) =>
        sortConversations([
          conversation,
          ...prev.filter((c) => c.id !== conversation.id),
        ]),
      );
      openConversation(conversation.id);
      return conversation.id;
    },
    [openConversation],
  );

  const sendTyping = useCallback((conversationId: string, typing: boolean) => {
    const socket = socketRef.current;
    if (socket?.connected) socket.emit("typing", { conversationId, typing });
  }, []);

  const searchContacts = useCallback(
    async (search: string): Promise<WireContact[]> => {
      const res = await api
        .get("messages/contacts", {
          searchParams: search ? { search } : {},
        })
        .json<Envelope<WireContact[]>>();
      return res.data;
    },
    [],
  );

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  return {
    status,
    oversight,
    sendBlock,
    conversations,
    conversationsLoading,
    conversationsError,
    refreshConversations,
    activeId,
    activeConversation,
    messages: activeId ? (messages[activeId] ?? []) : [],
    hasOlder: activeId ? (hasOlder[activeId] ?? false) : false,
    threadLoading,
    threadError,
    onlineIds,
    typingIn,
    openConversation,
    sendMessage,
    retryMessage,
    startConversation,
    sendTyping,
    markRead,
    loadOlder,
    searchContacts,
  };
}

export type ChatController = ReturnType<typeof useChat>;
