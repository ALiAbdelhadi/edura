"use client";

import { api } from "@/lib/api/client";
import { toast } from "@repo/ui/components/sonner";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function useCatalogMutation() {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);

  async function mutate(
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: unknown,
  ): Promise<boolean> {
    setBusy(true);
    try {
      const options = body === undefined ? undefined : { json: body };
      if (method === "POST") await api.post(path, options);
      else if (method === "PATCH") await api.patch(path, options);
      else await api.delete(path, options);
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
