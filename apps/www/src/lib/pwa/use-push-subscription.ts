"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";

export type PushPermissionState = "unsupported" | "default" | "denied" | "subscribed";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function isSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

/**
 * Native Web Push (VAPID) subscribe/unsubscribe against the same Serwist
 * service worker that handles offline caching — a combined worker, not a
 * dedicated push-only one, so there's a single registration to reason about.
 */
export function usePushSubscription() {
  const [state, setState] = useState<PushPermissionState>("default");
  const [isBusy, setIsBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!isSupported()) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    setState(existing ? "subscribed" : "default");
  }, []);

  useEffect(() => {
    // serviceWorker/Notification are browser-only — can't be a lazy useState
    // initializer, must run post-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported()) return false;
    setIsBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return false;
      }
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) return false;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Uint8Array's ArrayBufferLike generic doesn't structurally satisfy
        // BufferSource's ArrayBuffer requirement in current lib.dom types —
        // a known TS/DOM typing gap, not a real runtime mismatch.
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
      const json = sub.toJSON();
      await api.post("me/push-subscription", { json: { endpoint: json.endpoint, keys: json.keys } });
      setState("subscribed");
      return true;
    } finally {
      setIsBusy(false);
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!isSupported()) return;
    setIsBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.delete("me/push-subscription", { json: { endpoint: sub.endpoint } }).catch(() => {});
        await sub.unsubscribe();
      }
      setState("default");
    } finally {
      setIsBusy(false);
    }
  }, []);

  return { state, isBusy, subscribe, unsubscribe };
}
