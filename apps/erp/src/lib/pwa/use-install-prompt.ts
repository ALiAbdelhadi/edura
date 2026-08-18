"use client";

import { useCallback, useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "edura-pwa-install-dismissed-at";
const DISMISS_DAYS = 14;

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function wasRecentlyDismissed(): boolean {
  const raw = window.localStorage.getItem(DISMISS_KEY);
  const dismissedAt = raw ? Number(raw) : NaN;
  if (Number.isNaN(dismissedAt)) return false;
  return Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

export type InstallPromptState =
  | { kind: "none"; dismiss: () => void }
  | { kind: "ios"; dismiss: () => void }
  | { kind: "native"; install: () => void; dismiss: () => void };

export function useInstallPrompt(): InstallPromptState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [dismissed, setDismissed] = useState(true);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(wasRecentlyDismissed());
    setIos(isIos());

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  const dismiss = useCallback(() => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  }, []);

  const install = useCallback(() => {
    if (!deferred) return;
    void deferred.prompt().then(async () => {
      const choice = await deferred.userChoice;
      setDeferred(null);
      if (choice.outcome !== "accepted") dismiss();
    });
  }, [deferred, dismiss]);

  if (dismissed) return { kind: "none", dismiss };
  if (deferred) return { kind: "native", install, dismiss };
  if (ios) return { kind: "ios", dismiss };
  return { kind: "none", dismiss };
}
