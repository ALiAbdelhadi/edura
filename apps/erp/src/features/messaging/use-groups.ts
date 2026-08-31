"use client";

import { api } from "@/lib/api/client";
import { useCallback, useEffect, useState } from "react";
import type { Envelope } from "./chat-types";

export type WireGroup = {
  id: string;
  kind: "course" | "session" | "center_announcement";
  title: string;
  courseId: string | null;
  sessionId: string | null;
  centerId: string | null;
  ownerId: string;
  postPolicy: "owner_only" | "members";
  memberCount: number;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lastMessageSenderId: string | null;
  unreadCount: number;
  canPost: boolean;
  muted: boolean;
};

export type WireGroupMessage = {
  id: string;
  groupId: string;
  senderId: string;
  seq: number;
  body: string;
  clientId: string | null;
  createdAt: string;
  deleted: boolean;
};

type ThreadState = {
  group: {
    id: string;
    kind: WireGroup["kind"];
    title: string;
    postPolicy: WireGroup["postPolicy"];
    canPost: boolean;
    canManage: boolean;
    memberCount: number;
  };
  messages: WireGroupMessage[];
  hasMore: boolean;
};

export type GroupsController = ReturnType<typeof useGroups>;

export function useGroups() {
  const [groups, setGroups] = useState<WireGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadState | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api
        .get("messages/groups")
        .json<Envelope<WireGroup[]>>();
      setGroups(res.data);
      setError(null);
    } catch {
      setGroups([]);
      setError("load_failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = useCallback(async (groupId: string) => {
    setActiveId(groupId);
    setThreadLoading(true);
    setError(null);
    try {
      const res = await api
        .get(`messages/groups/${groupId}`)
        .json<Envelope<ThreadState>>();
      setThread(res.data);
      await api.post(`messages/groups/${groupId}/read`);
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, unreadCount: 0 } : g)),
      );
    } catch {
      setThread(null);
      setError("load_failed");
    } finally {
      setThreadLoading(false);
    }
  }, []);

  const post = useCallback(
    async (groupId: string, body: string): Promise<boolean> => {
      const text = body.trim();
      if (!text) return false;
      setError(null);
      try {
        const res = await api
          .post(`messages/groups/${groupId}`, {
            json: { body: text, clientId: crypto.randomUUID() },
          })
          .json<Envelope<WireGroupMessage>>();
        setThread((prev) =>
          prev && prev.group.id === groupId
            ? { ...prev, messages: [...prev.messages, res.data] }
            : prev,
        );
        void refresh();
        return true;
      } catch (e) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        setError(status === 429 ? "rate_limited" : "send_failed");
        // The caller keeps the draft on false — a failed post must never
        // clear the box and lose what the user typed.
        return false;
      }
    },
    [refresh],
  );

  const setMuted = useCallback(async (groupId: string, muted: boolean) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, muted } : g)),
    );
    try {
      await api.post(`messages/groups/${groupId}/mute`, { json: { muted } });
    } catch {
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, muted: !muted } : g)),
      );
    }
  }, []);

  const create = useCallback(
    async (input: {
      kind: WireGroup["kind"];
      courseId?: string;
      sessionId?: string;
      centerId?: string;
      title?: string;
      postPolicy?: WireGroup["postPolicy"];
    }) => {
      const res = await api
        .post("messages/groups", { json: input })
        .json<Envelope<{ id: string }>>();
      await refresh();
      await open(res.data.id);
      return res.data.id;
    },
    [refresh, open],
  );

  return {
    groups,
    loading,
    activeId,
    thread,
    threadLoading,
    error,
    refresh,
    open,
    post,
    setMuted,
    create,
  };
}
