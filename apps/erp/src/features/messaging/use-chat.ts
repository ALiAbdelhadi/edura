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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/**
 * Ack codes that mean "the server decided no". Retrying over REST cannot change
 * any of them — same authorization module, same rate-limit buckets.
 */
const TERMINAL_SEND_CODES = new Set([
  "rate_limited",
  "blocked",
  "policy_denied",
  "no_relationship",
  "not_participant",
  "invalid_body",
]);

/** Whether a parent can view the open thread (see chat-oversight.ts). */
export type OversightNotice = {
  monitored: boolean;
  minorParticipantId: string | null;
};

/**
 * The realtime URL is configured for the machine running the servers
 * (`http://localhost:3005`). Anything opening the app from ANOTHER device — a
 * phone on the LAN testing the PWA, a tunnel — resolves `localhost` to itself,
 * so the socket could never be reached and the UI sat on "Connection lost"
 * forever for every role. When the page itself is not on loopback but the
 * configured realtime host is, keep the port and reuse the host the app was
 * loaded from. A non-loopback configured host (staging/production) is returned
 * untouched.
 */
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
  /**
   * Whether the LAST list load failed. Two things depended on this existing.
   * The loaders below are all reached as floating `void load()` calls — the
   * mount effect and the socket's reconnect handler — so a rejection had no
   * catch anywhere and became an unhandled rejection: a bare
   * "Runtime TimeoutError" on the dev overlay, and nothing at all in
   * production. And with the failure swallowed, the list fell through to the
   * "no conversations yet" empty state, which tells the user their account is
   * empty when the truth is that we do not know.
   */
  const [conversationsError, setConversationsError] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, UiMessage[]>>({});
  const [hasOlder, setHasOlder] = useState<Record<string, boolean>>({});
  const [threadLoading, setThreadLoading] = useState(false);
  /** Same reasoning as `conversationsError`, for the open thread. */
  const [threadError, setThreadError] = useState(false);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [typingIn, setTypingIn] = useState<Record<string, boolean>>({});
  const [oversight, setOversight] = useState<OversightNotice | null>(null);
  /** Last send rejection worth surfacing ("rate_limited" | "blocked"). */
  const [sendBlock, setSendBlock] = useState<string | null>(null);

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
      setConversationsError(false);
    } catch {
      // Never rethrow: every caller is a floating `void refreshConversations()`
      // (mount, socket reconnect, an unknown conversation arriving), so a
      // rejection here has nowhere to go but the unhandled-rejection channel.
      // Keep whatever list we already had — a failed refresh is not evidence
      // the conversations are gone — and let the UI say the load failed.
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
      // Disclosure state travels with the thread so the banner can never be
      // out of date relative to the messages being shown.
      setOversight(res.data.oversight ?? null);
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
    } catch {
      // Reached as `void loadThread(...)` from openConversation and from the
      // socket's reconnect resync — same unhandled-rejection channel as the
      // list. An empty thread and a thread we failed to fetch are not the same
      // thing, and the reader is the one who has to know which.
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
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;
    let detachWake = () => {};

    const fetchToken = () =>
      api
        .get("realtime/token")
        .json<Envelope<{ token: string; url: string }>>();

    /**
     * socket.io does NOT retry when the server's auth middleware rejects the
     * handshake — it flips `socket.active` to false and stays down for good. So
     * one transient hiccup (an expired session, a token request that lost a
     * race with a server restart) left the socket dead until a full page
     * reload, showing "reconnecting" while nothing was reconnecting. Retry
     * those ourselves, with a capped backoff.
     */
    const scheduleManualReconnect = () => {
      if (disposed || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (disposed || !socket || socket.connected || socket.active) return;
        retryDelay = Math.min(retryDelay * 2, 10_000);
        socket.connect();
      }, retryDelay);
    };

    /** Network came back / the tab was resumed — attempt immediately. */
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

      // Mobile suspends the tab (and silently kills the socket) whenever the
      // app is backgrounded; these two events are what actually fire on the way
      // back, so they drive the reconnect instead of waiting on a ping timeout.
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
        // Resync anything missed while disconnected.
        void refreshConversations();
        const active = activeIdRef.current;
        if (active) void loadThread(active);
      });
      socket.on("disconnect", () => setStatus("offline"));
      socket.on("connect_error", () => {
        setStatus("offline");
        // `active === false` ⇒ the server denied us; socket.io has stopped.
        if (socket && !socket.active) scheduleManualReconnect();
      });

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
      if (retryTimer) clearTimeout(retryTimer);
      detachWake();
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
              // A REFUSAL is final — REST runs the same authorization and the
              // same shared rate-limit buckets, so retrying there would just
              // burn a second call and report the same answer. Only transport
              // failures fall back.
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