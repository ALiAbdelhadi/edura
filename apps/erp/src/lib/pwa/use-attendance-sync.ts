"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listQueuedAttendance,
  syncQueuedAttendance,
} from "@/lib/pwa/attendance-outbox";
import { toast } from "@repo/ui/components/sonner";
import { useTranslations } from "next-intl";

export type FlushResult =
  | { status: "empty" }
  | {
      status: "offline";
      synced: number;
      conflicts: number;
      errors: number;
      rejected: number;
    }
  | {
      status: "failed";
      message: string;
      synced: number;
      conflicts: number;
      errors: number;
      rejected: number;
    }
  | {
      status: "done";
      synced: number;
      conflicts: number;
      errors: number;
      rejected: number;
    };

const POLL_INTERVAL_MS = 60_000;
const FAILURE_BACKOFF_MS = 5 * 60_000;

export function useAttendanceSync(teacherId: string | undefined) {
  const t = useTranslations();
  const [queueCount, setQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const flushingRef = useRef(false);
  const backoffUntilRef = useRef(0);
  const notifiedRef = useRef<"failed" | "rejected" | null>(null);

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
    if (!force && Date.now() < backoffUntilRef.current) return { status: "empty" };
    if (force) backoffUntilRef.current = 0;
    const all = await listQueuedAttendance();
    if (!all.some((r) => r.teacherId === teacherId)) return { status: "empty" };
    if (typeof navigator !== "undefined" && !navigator.onLine)
      return { status: "offline", synced: 0, conflicts: 0, errors: 0, rejected: 0 };

    flushingRef.current = true;
    setIsSyncing(true);
    try {
      const result = await syncQueuedAttendance(teacherId);
      await refreshCount();
      // A refused sync backs off instead of blocking forever — the queue is
      // retried on the next interval after the window, and immediately on
      // manual sync / reconnect / tab focus.
      backoffUntilRef.current =
        result.status === "failed" ? Date.now() + FAILURE_BACKOFF_MS : 0;

      if (result.status === "failed") {
        if (notifiedRef.current !== "failed") {
          notifiedRef.current = "failed";
          toast.error(result.message || t("teacher.syncFailed"));
        }
      } else if (result.status === "done" && result.rejected > 0) {
        if (notifiedRef.current !== "rejected") {
          notifiedRef.current = "rejected";
          toast.warning(t("teacher.syncRejectedKept", { n: result.rejected }));
        }
      } else if (result.status === "done") {
        notifiedRef.current = null;
      }
      return result;
    } finally {
      flushingRef.current = false;
      setIsSyncing(false);
    }
  }, [teacherId, refreshCount, t]);

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
