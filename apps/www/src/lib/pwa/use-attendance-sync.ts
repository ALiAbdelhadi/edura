"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listQueuedAttendance,
  syncQueuedAttendance,
} from "@/lib/pwa/attendance-outbox";

export type FlushResult =
  | { status: "empty" }
  | { status: "offline" }
  | { status: "done"; synced: number; conflicts: number; errors: number };

const POLL_INTERVAL_MS = 60_000;

export function useAttendanceSync(teacherId: string | undefined) {
  const [queueCount, setQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const flushingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    const all = await listQueuedAttendance();
    setQueueCount(
      teacherId ? all.filter((r) => r.teacherId === teacherId).length : 0,
    );
  }, [teacherId]);

  const flush = useCallback(async (): Promise<FlushResult> => {
    if (!teacherId || flushingRef.current) return { status: "empty" };
    const all = await listQueuedAttendance();
    if (!all.some((r) => r.teacherId === teacherId)) return { status: "empty" };
    if (typeof navigator !== "undefined" && !navigator.onLine)
      return { status: "offline" };

    flushingRef.current = true;
    setIsSyncing(true);
    try {
      const result = await syncQueuedAttendance(teacherId);
      await refreshCount();
      return result ? { status: "done", ...result } : { status: "offline" };
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

    const onOnline = () => void flush();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void flush();
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
