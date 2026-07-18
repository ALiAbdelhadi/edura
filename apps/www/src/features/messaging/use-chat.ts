"use client";

// Realtime chat state machine — shared by every role's messages screen.
//
// Transport: Socket.IO to the standalone realtime server (WebSocket only, no
// polling). The handshake carries a short-lived JWT fetched from
// /api/v1/realtime/token; socket.io re-invokes the auth callback on every
// reconnect attempt, so a fresh token is minted each time. REST is the
// degraded fallback: if the socket is down, sends go through POST /messages
// and the UI keeps working without live updates.
//
// Ordering: the server assigns a monotonically increasing `seq` per message —
// committed messages sort by seq; optimistic (pending) ones render after.
// Idempotency: every send carries a client-generated UUID (`clientId`), so a
// retry after a reconnect can never duplicate a message.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
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
import type {
  ChatConnectionStatus,
  Envelope,
  UiMessage,
  WireContact,
  WireConversation,
  WireMessage,
} from "./chat-types";

const PAGE_SIZE = 50;

function sortConversations(list: WireConversation[]): WireConversation[] {
  return [...list].sort(
    (a, b) =>
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );
}

function insertMessage(list: UiMessage[], msg: UiMessage): UiMessage[] {
  // Dedupe by server id or optimistic clientId, then keep seq order
  // (pending messages have no real seq and stay at the tail).
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, UiMessage[]>>({});
  const [hasOlder, setHasOlder] = useState<Record<string, boolean>>({});
  const [threadLoading, setThreadLoading] = useState(false);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [typingIn, setTypingIn] = useState<Record<string, boolean>>({});

  const socketRef = useRef<Socket | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  activeIdRef.current = activeId;

  // ---------------------------------------------------------------------
  // REST loaders
  // ---------------------------------------------------------------------
  const refreshConversations = useCallback(async () => {
    try {
      const res = await api
        .get("messages/conversations")
        .json<Envelope<WireConversation[]>>();
      setConversations(sortConversations(res.data));
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  const loadThread = useCallback(async (conversationId: string) => {
    setThreadLoading(true);
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
          }>
        >();
      setMessages((prev) => {
        // Keep any local pending messages that are still in flight.
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

  // ---------------------------------------------------------------------
  // Read marking (socket first, REST fallback — both fan receipts out)
  // ---------------------------------------------------------------------
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

  // ---------------------------------------------------------------------
  // Socket lifecycle
  // ---------------------------------------------------------------------
  useEffect(() => {
    let disposed = false;
    let socket: Socket | null = null;

    const fetchToken = () =>
      api
        .get("realtime/token")
        .json<Envelope<{ token: string; url: string }>>();

    void (async () => {
      let url = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:3005";
      try {
        const first = await fetchToken();
        url = first.data.url || url;
      } catch {
        // Session missing or endpoint down — socket auth callback will retry.
      }
      if (disposed) return;

      socket = io(url, {
        transports: ["websocket"],
        reconnectionDelayMax: 10_000,
        // Called on EVERY (re)connection attempt → always a fresh token.
        auth: (cb) => {
          fetchToken()
            .then((res) => cb({ token: res.data.token }))
            .catch(() => cb({}));
        },
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        setStatus("online");
        // Resync anything missed while disconnected.
        void refreshConversations();
        const active = activeIdRef.current;
        if (active) void loadThread(active);
      });
      socket.on("disconnect", () => setStatus("offline"));
      socket.on("connect_error", () => setStatus("offline"));

      socket.on("message:new", (ev: MessageNewEvent) => {
        const msg = ev.message as unknown as WireMessage;
        const mine = msg.senderId === meId;
        const isActive = activeIdRef.current === msg.conversationId;

        setMessages((prev) => {
          if (!(msg.conversationId in prev)) return prev; // thread not loaded
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
        // Viewing the thread while a message lands ⇒ it is read.
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
          // Another of my tabs read it — clear the badge here too.
          setConversations((prev) =>
            prev.map((c) =>
              c.id === ev.conversationId ? { ...c, unreadCount: 0 } : c,
            ),
          );
          return;
        }
        // Partner read my messages.
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
      socket?.disconnect();
      socketRef.current = null;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, [meId, refreshConversations, loadThread, markRead]);

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------
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
          finalize(res.data);
        } catch {
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
              if (err || !ack?.ok) void sendViaRest();
              else finalize(ack.message as unknown as WireMessage);
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
      // Same clientId ⇒ idempotent on the server.
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
    conversations,
    conversationsLoading,
    activeId,
    activeConversation,
    messages: activeId ? (messages[activeId] ?? []) : [],
    hasOlder: activeId ? (hasOlder[activeId] ?? false) : false,
    threadLoading,
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
