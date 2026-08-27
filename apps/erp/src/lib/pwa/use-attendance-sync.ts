"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listQueuedAttendance,
  syncQueuedAttendance,
} from "@/lib/pwa/attendance-outbox";

export type FlushResult =
  | { status: "empty" }
  | { status: "offline"; synced: number; conflicts: number; errors: number }
  | {
      status: "failed";
      message: string;
      synced: number;
      conflicts: number;
      errors: number;
    }
  | { status: "done"; synced: number; conflicts: number; errors: number };

const POLL_INTERVAL_MS = 60_000;

export function useAttendanceSync(teacherId: string | undefined) {
  const [queueCount, setQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const flushingRef = useRef(false);
  const blockedRef = useRef(false);

  const refreshCount = useCallback(async () => {
    const all = await listQueuedAttendance();
    setQueueCount(
      teacherId ? all.filter((r) => r.teacherId === teacherId).length : 0,
    );
  }, [teacherId]);

  const flush = useCallback(async (
    { force = false }: { force?: boolean } = {},
  ): Promise<FlushResult> => {
    if (!teacherId || flushingRef.current) return { status: "empty" };
    if (blockedRef.current && !force) return { status: "empty" };
    if (force) blockedRef.current = false;
    const all = await listQueuedAttendance();
    if (!all.some((r) => r.teacherId === teacherId)) return { status: "empty" };
    if (typeof navigator !== "undefined" && !navigator.onLine)
      return { status: "offline", synced: 0, conflicts: 0, errors: 0 };

    flushingRef.current = true;
    setIsSyncing(true);
    try {
      const result = await syncQueuedAttendance(teacherId);
      await refreshCount();
      blockedRef.current = result.status === "failed";
      return result;
    } finally {
      flushingRef.current = false;
      setIsSyncing(false);
    }
  }, [teacherId, refreshCount]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (!teacherId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void flush();

    const onOnline = () => void flush({ force: true });
    const onVisibility = () => {
      if (document.visibilityState === "visible") void flush({ force: true });
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(() => void flush(), POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [teacherId, flush]);

  return { queueCount, isSyncing, flush, refreshCount };
}
