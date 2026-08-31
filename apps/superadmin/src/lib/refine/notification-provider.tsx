"use client";

import type { NotificationProvider } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { toast } from "@repo/ui/components/sonner";

const DEDUPE_WINDOW_MS = 1000;
const recent = new Map<string, number>();

function isDuplicate(text: string): boolean {
  const now = Date.now();
  for (const [k, at] of recent) {
    if (now - at > DEDUPE_WINDOW_MS) recent.delete(k);
  }
  if (recent.has(text)) return true;
  recent.set(text, now);
  return false;
}

export function useSonnerNotificationProvider(): NotificationProvider {
  const t = useTranslations("common");
  return useMemo(
    () => ({
      open: ({ key, message, description, type }) => {
        if (type !== "error") return;
        const detail =
          description && description !== message ? description : message;
        if (isDuplicate(detail)) return;
        toast.error(t("requestFailed"), {
          id: key,
          description: detail,
        });
      },
      close: (key: string) => toast.dismiss(key),
    }),
    [t],
  );
}
