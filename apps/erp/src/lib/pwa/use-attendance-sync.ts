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

/**
 * Owns the attendance outbox lifecycle: tracks how many records are queued
 * for this teacher and replays them through the sync endpoint on reconnect,
 * on tab foreground, and on a slow poll while anything remains queued.
 */
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

  /**
   * A refusal the server has already given will be given again to the same
   * bytes, so the background poll stands down after one and waits for something
   * to have changed — a reconnect, a return to the tab, or the teacher pressing
   * the button. Without this the queue that cannot drain retries every minute
   * for the rest of the session; when the refusal is a 401 that is also a
   * minute-by-minute session-integrity alarm on a screen nobody is looking at.
   */
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
      // The outcome is the outbox's own: it distinguishes a request that never
      // reached the server (retry) from one the server refused (retrying
      // unchanged will refuse again), which a single null could not.
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
    // IndexedDB is only available client-side, so this can't be a lazy
    // useState initializer — it must run post-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (!teacherId) return;
    // Attempt a flush immediately on mount (e.g. the app was reopened after
    // being offline) — same post-mount-only constraint as above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void flush();

    // A reconnect or a return to the tab is new information — it clears a
    // previous refusal and tries again.
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
