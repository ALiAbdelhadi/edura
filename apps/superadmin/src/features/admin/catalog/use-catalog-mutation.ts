"use client";

import { useApiUrl } from "@refinedev/core";
import { toast } from "@repo/ui/components/sonner";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function useCatalogMutation() {
  const apiUrl = useApiUrl();
  const t = useTranslations();
  const [busy, setBusy] = useState(false);

  async function mutate(
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: unknown,
  ): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(`${apiUrl}/${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message || t("common.requestFailed"));
      }
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.failed"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { mutate, busy };
}
